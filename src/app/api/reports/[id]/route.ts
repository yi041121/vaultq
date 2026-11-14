import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyUser } from "@/lib/notification-service";
import { REPORT_INCLUDE } from "@/lib/report-include";
import { validateReportDetails } from "@/lib/report-validation";
import { ImageValidationError, normalizeImageSources } from "@/lib/image-validation";
import { ClaimReviewError, isReviewWriteConflict, reviewUnclaimedReport } from "@/lib/claim-review-service";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/reports/:id — report details (owner or admin)
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const report = await prisma.report.findUnique({ where: { id }, include: REPORT_INCLUDE });
    if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    if (user.role === "STUDENT" && report.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your report" }, { status: 403 });
    }
    if (user.role === "STUDENT" && report.item) {
      return NextResponse.json({
        success: true,
        data: { ...report, item: { ...report.item, locker: null } },
      });
    }
    return NextResponse.json({ success: true, data: report });
  } catch (e) {
    console.error("Report fetch failed", e);
    return NextResponse.json({ success: false, error: "Failed to fetch report" }, { status: 500 });
  }
}

// PATCH /api/reports/:id — student edits own pending report, or admin match / reject / close / reopen
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await request.json();

    if (user.role === "STUDENT") {
      if ((body.action ?? "update") !== "update") {
        return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
      }

      const report = await prisma.report.findUnique({ where: { id } });
      if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
      if (report.userId !== user.id) {
        return NextResponse.json({ success: false, error: "Not your report" }, { status: 403 });
      }
      if (report.status !== "PENDING") {
        return NextResponse.json(
          { success: false, error: `A ${report.status.toLowerCase()} report can no longer be edited` },
          { status: 409 },
        );
      }

      const parsed = validateReportDetails(body);
      if (!parsed.ok) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
      }

      let imageUpdate: { imageUrl: string | null; imageUrls: string[] } | null = null;
      if (body.imageUrls !== undefined) {
        const nextImages = await normalizeImageSources(body.imageUrls);
        imageUpdate = { imageUrls: nextImages, imageUrl: nextImages[0] || null };
      }

      const duplicate = await prisma.report.findFirst({
        where: {
          id: { not: id },
          userId: user.id,
          type: report.type,
          itemName: { equals: parsed.value.itemName, mode: "insensitive" },
          status: "PENDING",
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "You already have another pending report for this item" },
          { status: 409 },
        );
      }

      const updated = await prisma.$transaction(async tx => {
        const changed = await tx.report.updateMany({
          where: { id, userId: user.id, status: "PENDING", itemId: report.itemId }, data: { ...parsed.value, ...(imageUpdate ?? {}) },
        });
        if (changed.count !== 1) throw new ClaimReviewError("Report was linked or reviewed. Please refresh before editing.", 409);
        return tx.report.findUniqueOrThrow({ where: { id }, include: REPORT_INCLUDE });
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const action = body.action;
    if (!["update", "match", "reject", "close", "reopen"].includes(action)) {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });

    if (action === "update") {
      if (report.status !== "PENDING") {
        return NextResponse.json(
          { success: false, error: `A ${report.status.toLowerCase()} report can no longer be edited` },
          { status: 409 },
        );
      }
      const nextImages = await normalizeImageSources(body.imageUrls);
      const updated = await reviewUnclaimedReport(id, report, { imageUrls: nextImages, imageUrl: nextImages[0] || null });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "match") {
      if (report.type !== "LOST") {
        return NextResponse.json({ success: false, error: "Only lost reports can be matched" }, { status: 400 });
      }
      if (!["PENDING", "MATCHED"].includes(report.status)) {
        return NextResponse.json({ success: false, error: `Report is already ${report.status.toLowerCase()}` }, { status: 409 });
      }
      const itemId = body.itemId;
      if (!itemId) return NextResponse.json({ success: false, error: "itemId required" }, { status: 400 });

      const item = await prisma.item.findUnique({
        where: { id: itemId },
        select: { id: true, itemName: true, status: true },
      });
      if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      if (item.status !== "FOUND") {
        return NextResponse.json({ success: false, error: "Item is no longer available" }, { status: 400 });
      }

      // A lightweight notice link only: the student is told an item matches,
      // but the claim still goes through the normal review/approval flow.
      const updated = await reviewUnclaimedReport(id, report, {
          status: "MATCHED",
          itemId: item.id,
          reviewedById: user.id,
          reviewedAt: new Date(),
          adminNote: null,
      }, item.id);

      await notifyUser(
        report.userId,
        "Lost Item Match Found",
        `A found item matching your report for ${report.itemName} is available. Search for "${item.itemName}" and submit a claim with photo evidence.`,
        { type: "REPORT", link: `/dashboard/student/search?item=${item.id}` },
      );

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "reject") {
      if (report.status === "VERIFIED") {
        return NextResponse.json({ success: false, error: "Verified reports cannot be rejected" }, { status: 409 });
      }
      const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : null;
      const updated = await reviewUnclaimedReport(id, report, {
          status: "REJECTED",
          itemId: null,
          reviewedById: user.id,
          reviewedAt: new Date(),
          adminNote: adminNote || null,
      });

      await notifyUser(
        report.userId,
        "Report Rejected",
        `Your ${report.type === "LOST" ? "lost" : "found"} item report for ${report.itemName} was rejected.${adminNote ? ` Reason: ${adminNote}` : " Contact the Lost & Found office for details."}`,
        { type: "REPORT", link: "/dashboard/student/report?tab=reports&kind=" + report.type },
      );

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "close") {
      if (report.type !== "LOST") {
        return NextResponse.json({ success: false, error: "Only lost reports can be closed" }, { status: 400 });
      }
      if (!["PENDING", "MATCHED"].includes(report.status)) {
        return NextResponse.json({ success: false, error: `Report is already ${report.status.toLowerCase()}` }, { status: 409 });
      }
      const updated = await reviewUnclaimedReport(id, report, { status: "CLOSED", reviewedById: user.id, reviewedAt: new Date() });

      await notifyUser(
        report.userId,
        "Lost Report Closed",
        `Your lost item report for ${report.itemName} has been closed. Contact the Lost & Found office if you still need help.`,
        { type: "REPORT", link: "/dashboard/student/report?tab=reports&kind=" + report.type },
      );

      return NextResponse.json({ success: true, data: updated });
    }

    // reopen
    if (!["REJECTED", "CLOSED"].includes(report.status)) {
      return NextResponse.json({ success: false, error: "Only rejected or closed reports can be reopened" }, { status: 409 });
    }
    const updated = await reviewUnclaimedReport(id, report, {
        status: "PENDING",
        itemId: null,
        reviewedById: null,
        reviewedAt: null,
        adminNote: null,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof ImageValidationError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (e instanceof ClaimReviewError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (isReviewWriteConflict(e)) return NextResponse.json({ success: false, error: "Report changed during another review. Please refresh." }, { status: 409 });
    console.error("Report review failed", e);
    return NextResponse.json({ success: false, error: "Failed to review report" }, { status: 500 });
  }
}

// DELETE /api/reports/:id — student withdraws their own pending report
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STUDENT") {
    return NextResponse.json({ success: false, error: "Only students can withdraw reports" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const report = await prisma.report.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    if (report.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your report" }, { status: 403 });
    }
    if (report.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `Report is already ${report.status.toLowerCase()}` }, { status: 409 });
    }

    const removed = await prisma.report.deleteMany({ where: { id, userId: user.id, status: "PENDING" } });
    if (removed.count !== 1) return NextResponse.json({ success: false, error: "Report was linked or reviewed. Please refresh." }, { status: 409 });
    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    console.error("Report withdrawal failed", e);
    return NextResponse.json({ success: false, error: "Failed to withdraw report" }, { status: 500 });
  }
}
