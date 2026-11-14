import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyUser, notifyUsers } from "@/lib/notification-service";
import { cancelPendingClaim, rejectPendingClaim, ClaimTransitionError } from "@/lib/claim-transition-service";
import { approvePendingClaim, ClaimReviewError, isReviewWriteConflict } from "@/lib/claim-review-service";

type Ctx = { params: Promise<{ id: string }> };

const CLAIM_INCLUDE = {
  item: {
    select: {
      id: true,
      itemName: true,
      category: true,
      description: true,
      foundLocation: true,
      foundDate: true,
      status: true,
      imageUrl: true,
      createdAt: true,
      locker: { select: { lockerNumber: true } },
      reports: {
        where: { type: "FOUND", status: "VERIFIED" },
        select: { imageUrls: true },
        take: 1,
      },
    },
  },
  user: { select: { name: true, studentId: true, email: true } },
  qrCode: { select: { expiresAt: true, isUsed: true } },
} as const;

// GET /api/claims/:id — claim details (owner or admin)
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const claim = await prisma.claim.findUnique({ where: { id }, include: CLAIM_INCLUDE });
    if (!claim) return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    if (user.role === "STUDENT" && claim.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your claim" }, { status: 403 });
    }

    // Matched claims have no uploaded evidence — use the lost report photos.
    const hasOwnEvidence = claim.evidenceImageUrls?.length > 0 || !!claim.evidenceImageUrl;
    let evidenceImageUrls: string[] = claim.evidenceImageUrls?.length
      ? claim.evidenceImageUrls
      : claim.evidenceImageUrl
        ? [claim.evidenceImageUrl]
        : [];
    let evidenceUploadedAt = claim.createdAt ? new Date(claim.createdAt).toISOString() : "";
    if (!evidenceImageUrls.length) {
      const report = await prisma.report.findFirst({
        where: { type: "LOST", userId: claim.userId, itemId: claim.itemId },
        select: { imageUrl: true, imageUrls: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      if (!hasOwnEvidence && report?.createdAt) {
        evidenceUploadedAt = new Date(report.createdAt).toISOString();
      }
      evidenceImageUrls = (
        report && Array.isArray(report.imageUrls) && report.imageUrls.length
          ? report.imageUrls
          : report?.imageUrl
            ? [report.imageUrl]
            : []
      ).filter(Boolean).slice(0, 3);
    }
    let matchedReportDescription: string | null = null;
    if (claim.matchedReportId) {
      const matchedReport = await prisma.report.findUnique({
        where: { id: claim.matchedReportId },
        select: { description: true },
      });
      matchedReportDescription = matchedReport?.description || null;
    }

    const withEvidence = {
      ...claim,
      evidenceImageUrls,
      evidenceImageUrl: claim.evidenceImageUrl || evidenceImageUrls[0] || null,
      evidenceUploadedAt,
      matchedReportDescription,
    };

    if (user.role === "STUDENT" && claim.status !== "APPROVED") {
      return NextResponse.json({
        success: true,
        data: { ...withEvidence, item: { ...claim.item, locker: null } },
      });
    }

    return NextResponse.json({ success: true, data: withEvidence });
  } catch (e) {
    console.error("Claim fetch failed", e);
    return NextResponse.json({ success: false, error: "Failed to fetch claim" }, { status: 500 });
  }
}

// PATCH /api/claims/:id — admin approves (with optional locker) or rejects
// Body: { action: "approve" | "reject", lockerNumber?: string }
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid review details" }, { status: 400 });
    }
    const { action, lockerNumber } = body;
    const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : null;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ success: false, error: "action must be approve or reject" }, { status: 400 });
    }
    if (lockerNumber != null && typeof lockerNumber !== "string") return NextResponse.json({ success: false, error: "Invalid locker number" }, { status: 400 });

    const claim = await prisma.claim.findUnique({
      where: { id },
      include: {
        item: {
          select: {
            id: true,
            itemName: true,
            status: true,
            lockerId: true,
            locker: { select: { lockerNumber: true } },
          },
        },
      },
    });
    if (!claim) return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    if (claim.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `Claim already ${claim.status.toLowerCase()}` }, { status: 409 });
    }

    if (action === "reject") {
      const updated = await rejectPendingClaim(id, adminNote || null);
      await notifyUser(
        updated.userId,
        "Claim Rejected",
        `Your claim for ${updated.item.itemName} was rejected.${adminNote ? ` Reason: ${adminNote}` : " Contact the Lost & Found office for details."}`,
        { type: "CLAIM", link: "/dashboard/student/claims" },
      );
      return NextResponse.json({ success: true, data: updated });
    }

    const lockerNum = lockerNumber ? String(lockerNumber).trim().toUpperCase() : null;
    const { updated, otherPending, matchedReports, itemName, userId, locker } = await approvePendingClaim(id, user.id, { lockerNumber: lockerNum, adminNote });

    // Notify the winning student and everyone whose claim was closed.
    await notifyUser(
      userId,
      "Claim Approved",
      `Your claim for ${itemName} has been approved.${
        locker ? ` Locker ${locker} is assigned.` : ""
      } View your QR code in My Claims. At the locker kiosk, scan your student card barcode (or show the barcode from your Profile), then scan the QR code to open the locker and collect your item.`,
      { type: "CLAIM", link: "/dashboard/student/claims" },
    );

    await notifyUsers(
      otherPending.map((c) => ({
        userId: c.userId,
        title: "Claim Rejected",
        message: `Your claim for ${itemName} was rejected because the item was claimed by another student.`,
        type: "CLAIM" as const,
        link: "/dashboard/student/claims",
      })),
    );

    await notifyUsers(
      matchedReports
        .filter((r) => r.userId !== userId)
        .map((r) => ({
          userId: r.userId,
          title: "Lost Report Closed",
          message: `The item you reported lost (${itemName}) has been claimed by another student, so your report was closed.`,
          type: "REPORT" as const,
          link: "/dashboard/student/report?tab=reports&kind=LOST",
        })),
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof ClaimTransitionError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (e instanceof ClaimReviewError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (isReviewWriteConflict(e)) return NextResponse.json({ success: false, error: "Another review changed this item or locker. Please refresh." }, { status: 409 });
    console.error("Claim review failed", e);
    return NextResponse.json({ success: false, error: "Failed to review claim" }, { status: 500 });
  }
}

// DELETE /api/claims/:id — student cancels their own claim while it is pending
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STUDENT") {
    return NextResponse.json({ success: false, error: "Only students can cancel claims" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const data = await cancelPendingClaim(id, user.id);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ClaimTransitionError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("Claim cancel failed", e);
    return NextResponse.json({ success: false, error: "Failed to cancel claim" }, { status: 500 });
  }
}
