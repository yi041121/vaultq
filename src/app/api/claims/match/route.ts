import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyUser, notifyUsers } from "@/lib/notification-service";

// POST /api/claims/match — admin links a lost report to a found item. The
// claim is approved immediately (locker assigned, pickup QR ready), so the
// admin does not need to approve it again in the Claims queue.
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  try {
    const body = await request.json();
    const reportId = typeof body.reportId === "string" ? body.reportId : null;
    const itemId = typeof body.itemId === "string" ? body.itemId : null;
    if (!reportId || !itemId) {
      return NextResponse.json({ success: false, error: "reportId and itemId are required" }, { status: 400 });
    }

    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    if (report.type !== "LOST") {
      return NextResponse.json({ success: false, error: "Only lost reports can be matched" }, { status: 400 });
    }
    if (report.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `Report is already ${report.status.toLowerCase()}` }, { status: 409 });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { locker: { select: { id: true, lockerNumber: true } } },
    });
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    if (item.status !== "FOUND") {
      return NextResponse.json({ success: false, error: "Item is no longer available" }, { status: 400 });
    }

    const existing = await prisma.claim.findFirst({
      where: { itemId, userId: report.userId, status: { in: ["PENDING", "APPROVED"] } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "This student already has a claim for the item" },
        { status: 409 },
      );
    }

    const photos = (
      Array.isArray(report.imageUrls) && report.imageUrls.length
        ? report.imageUrls
        : report.imageUrl
          ? [report.imageUrl]
          : []
    ).filter(Boolean).slice(0, 3);

    // Use the item's own locker, or allocate the first available one.
    let locker = item.locker;
    if (!locker) {
      locker = await prisma.locker.findFirst({
        where: { status: "AVAILABLE" },
        orderBy: { lockerNumber: "asc" },
        select: { id: true, lockerNumber: true },
      });
    }

    const otherPending = await prisma.claim.findMany({
      where: { itemId, status: "PENDING", NOT: { userId: report.userId } },
      select: { id: true, userId: true },
    });

    // Other lost reports already linked to this item are closed too.
    const otherMatchedReports = await prisma.report.findMany({
      where: { itemId, type: "LOST", status: "MATCHED", NOT: { id: report.id } },
      select: { id: true, userId: true },
    });

    const claim = await prisma.$transaction(async (tx) => {
      const created = await tx.claim.create({
        data: {
          itemId,
          userId: report.userId,
          claimReason: "Matched by admin from lost report",
          evidenceImageUrl: photos[0] || null,
          evidenceImageUrls: photos,
          source: "MATCH",
          matchedReportId: report.id,
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });

      await tx.item.update({
        where: { id: itemId },
        data: { status: "CLAIMED", ...(locker ? { lockerId: locker.id } : {}) },
      });
      if (locker) {
        await tx.locker.update({ where: { id: locker.id }, data: { status: "OCCUPIED" } });
      }

      // The matched report is resolved by this approval.
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: "CLOSED",
          itemId,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });

      if (otherMatchedReports.length) {
        await tx.report.updateMany({
          where: { itemId, type: "LOST", status: "MATCHED", NOT: { id: report.id } },
          data: { status: "CLOSED", reviewedAt: new Date() },
        });
      }

      if (otherPending.length) {
        await tx.claim.updateMany({
          where: { id: { in: otherPending.map((c) => c.id) } },
          data: {
            status: "REJECTED",
            adminNote: "Item has been claimed by another student",
            approvedAt: new Date(),
          },
        });
      }

      return created;
    });

    const lockerNote = locker ? ` Locker ${locker.lockerNumber} is assigned.` : "";

    await notifyUsers(
      otherPending.map((c) => ({
        userId: c.userId,
        title: "Claim Rejected",
        message: `Your claim for ${item.itemName} was rejected because the item has been claimed by another student.`,
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
          message: `The item you reported lost (${item.itemName}) has been claimed by another student, so your report was closed.`,
          type: "REPORT" as const,
          link: "/dashboard/student/report?tab=reports",
        })),
    );

    await notifyUser(
      report.userId,
      "Lost Item Matched — Claim Approved",
      `Your lost report for ${report.itemName} was matched to a found item and approved.${lockerNote} View your pickup QR code in My Claims. At the locker kiosk, scan your registered student ID barcode, then scan the QR code to open the locker and collect your item.`,
      { type: "CLAIM", link: "/dashboard/student/claims" },
    );

    return NextResponse.json(
      { success: true, data: { ...claim, locker: locker?.lockerNumber || null } },
      { status: 201 },
    );
  } catch (e) {
    console.error("Claim match failed", e);
    return NextResponse.json({ success: false, error: "Failed to match claim" }, { status: 500 });
  }
}
