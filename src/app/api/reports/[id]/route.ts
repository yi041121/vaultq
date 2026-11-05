import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyUser, notifyUsers } from "@/lib/notification-service";
import { REPORT_INCLUDE } from "@/lib/report-include";
import { validateReportDetails } from "@/lib/report-validation";

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
        if (!Array.isArray(body.imageUrls) || body.imageUrls.length > 3) {
          return NextResponse.json({ success: false, error: "You can upload up to 3 photos" }, { status: 400 });
        }
        for (const value of body.imageUrls) {
          if (typeof value !== "string" || !value.startsWith("data:image/")) {
            return NextResponse.json({ success: false, error: "Photos must be images" }, { status: 400 });
          }
          const base64 = value.slice(value.indexOf(",") + 1);
          if (Math.ceil(base64.length * 0.75) > 5 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: "Each image must be under 5MB" }, { status: 400 });
          }
        }
        imageUpdate = { imageUrls: body.imageUrls, imageUrl: body.imageUrls[0] || null };
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

      const updated = await prisma.report.update({
        where: { id },
        data: { ...parsed.value, ...(imageUpdate ?? {}) },
        include: REPORT_INCLUDE,
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
      if (!Array.isArray(body.imageUrls) || body.imageUrls.length > 3) {
        return NextResponse.json({ success: false, error: "You can upload up to 3 photos" }, { status: 400 });
      }
      for (const value of body.imageUrls) {
        if (typeof value !== "string" || !value.startsWith("data:image/")) {
          return NextResponse.json({ success: false, error: "Photos must be images" }, { status: 400 });
        }
        const base64 = value.slice(value.indexOf(",") + 1);
        if (Math.ceil(base64.length * 0.75) > 5 * 1024 * 1024) {
          return NextResponse.json({ success: false, error: "Each image must be under 5MB" }, { status: 400 });
        }
      }
      const updated = await prisma.report.update({
        where: { id },
        data: { imageUrls: body.imageUrls, imageUrl: body.imageUrls[0] || null },
        include: REPORT_INCLUDE,
      });
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

      // Re-matching an already matched report is only allowed for the same
      // item, otherwise the previous claim and QR would be orphaned.
      if (report.status === "MATCHED" && report.itemId && report.itemId !== item.id) {
        return NextResponse.json(
          { success: false, error: "Report is already matched to another item" },
          { status: 409 },
        );
      }
      if (item.status !== "FOUND" && report.itemId !== item.id) {
        return NextResponse.json({ success: false, error: "Item is no longer available" }, { status: 400 });
      }

      // Matching approves the student's pickup immediately: the admin has
      // verified ownership, so a claim and a 24h pickup QR are created.
      const otherPending = await prisma.claim.findMany({
        where: { itemId: item.id, status: "PENDING", NOT: { userId: report.userId } },
        select: { id: true, userId: true },
      });
      const otherMatchedReports = await prisma.report.findMany({
        where: { itemId: item.id, type: "LOST", status: "MATCHED", NOT: { id } },
        select: { id: true, userId: true },
      });

      const { updated, claim } = await prisma.$transaction(async (tx) => {
        const existingClaim = await tx.claim.findFirst({
          where: { itemId: item.id, userId: report.userId },
          orderBy: { createdAt: "desc" },
        });

        const claim = existingClaim
          ? await tx.claim.update({
              where: { id: existingClaim.id },
              data: { status: "APPROVED", approvedAt: existingClaim.approvedAt ?? new Date() },
            })
          : await tx.claim.create({
              data: {
                itemId: item.id,
                userId: report.userId,
                status: "APPROVED",
                approvedAt: new Date(),
                claimReason: "Matched by admin from lost report",
              },
            });

        // Everyone else waiting on this item loses automatically.
        await tx.claim.updateMany({
          where: { itemId: item.id, status: "PENDING", NOT: { id: claim.id } },
          data: { status: "REJECTED" },
        });

        if (otherMatchedReports.length) {
          await tx.report.updateMany({
            where: { id: { in: otherMatchedReports.map((r) => r.id) } },
            data: { status: "CLOSED", reviewedAt: new Date() },
          });
        }

        await tx.item.update({ where: { id: item.id }, data: { status: "CLAIMED" } });

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await tx.qrCode.upsert({
          where: { claimId: claim.id },
          create: { claimId: claim.id, expiresAt },
          update: { isUsed: false, expiresAt },
        });

        const updated = await tx.report.update({
          where: { id },
          data: {
            status: "MATCHED",
            itemId: item.id,
            reviewedById: user.id,
            reviewedAt: new Date(),
            adminNote: null,
          },
          include: REPORT_INCLUDE,
        });

        return { updated, claim };
      });

      await notifyUser(
        report.userId,
        "Lost Item Match Found",
        `A found item matching your report for ${report.itemName} is ready. Your pickup QR code is in My Claims — scan your registered student ID barcode at the locker kiosk, then the QR code, to open the locker and collect the item.`,
        { type: "CLAIM", link: "/dashboard/student/claims" },
      );

      await notifyUsers(
        otherPending.map((c) => ({
          userId: c.userId,
          title: "Claim Rejected",
          message: `Your claim for ${item.itemName} was rejected because the item was matched to another student.`,
          type: "CLAIM" as const,
          link: "/dashboard/student/claims",
        })),
      );

      await notifyUsers(
        otherMatchedReports
          .filter((r) => r.userId !== report.userId)
          .map((r) => ({
            userId: r.userId,
            title: "Lost Report Closed",
            message: `The item you reported lost (${item.itemName}) has been matched to another student, so your report was closed.`,
            type: "REPORT" as const,
            link: "/dashboard/student/report?tab=reports",
          })),
      );

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "reject") {
      if (report.status === "VERIFIED") {
        return NextResponse.json({ success: false, error: "Verified reports cannot be rejected" }, { status: 409 });
      }
      const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : null;
      const updated = await prisma.report.update({
        where: { id },
        data: {
          status: "REJECTED",
          itemId: null,
          reviewedById: user.id,
          reviewedAt: new Date(),
          adminNote: adminNote || null,
        },
        include: REPORT_INCLUDE,
      });

      await notifyUser(
        report.userId,
        "Report Rejected",
        `Your ${report.type === "LOST" ? "lost" : "found"} item report for ${report.itemName} was rejected.${adminNote ? ` Reason: ${adminNote}` : " Contact the Lost & Found office for details."}`,
        { type: "REPORT", link: "/dashboard/student/report?tab=reports" },
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
      const updated = await prisma.report.update({
        where: { id },
        data: { status: "CLOSED", reviewedById: user.id, reviewedAt: new Date() },
        include: REPORT_INCLUDE,
      });

      await notifyUser(
        report.userId,
        "Lost Report Closed",
        `Your lost item report for ${report.itemName} has been closed. Contact the Lost & Found office if you still need help.`,
        { type: "REPORT", link: "/dashboard/student/report?tab=reports" },
      );

      return NextResponse.json({ success: true, data: updated });
    }

    // reopen
    if (!["REJECTED", "CLOSED"].includes(report.status)) {
      return NextResponse.json({ success: false, error: "Only rejected or closed reports can be reopened" }, { status: 409 });
    }
    const updated = await prisma.report.update({
      where: { id },
      data: {
        status: "PENDING",
        itemId: null,
        reviewedById: null,
        reviewedAt: null,
        adminNote: null,
      },
      include: REPORT_INCLUDE,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
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

    await prisma.report.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    console.error("Report withdrawal failed", e);
    return NextResponse.json({ success: false, error: "Failed to withdraw report" }, { status: 500 });
  }
}
