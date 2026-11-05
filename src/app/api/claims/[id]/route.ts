import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyUser, notifyUsers } from "@/lib/notification-service";

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
    const withEvidence = {
      ...claim,
      evidenceImageUrls,
      evidenceImageUrl: claim.evidenceImageUrl || evidenceImageUrls[0] || null,
      evidenceUploadedAt,
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
    const body = await request.json();
    const { action, lockerNumber } = body;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ success: false, error: "action must be approve or reject" }, { status: 400 });
    }

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
      const updated = await prisma.claim.update({ where: { id }, data: { status: "REJECTED" } });
      await notifyUser(
        claim.userId,
        "Claim Rejected",
        `Your claim for ${claim.item.itemName} was rejected. Contact the Lost & Found office for details.`,
        { type: "CLAIM", link: "/dashboard/student/claims" },
      );
      return NextResponse.json({ success: true, data: updated });
    }

    // Approve — an item can only be approved once. If another claim was
    // already approved, this claim can no longer win the item.
    if (claim.item.status !== "FOUND") {
      return NextResponse.json({ success: false, error: "Item is no longer available" }, { status: 409 });
    }

    const lockerNum = lockerNumber ? String(lockerNumber).trim().toUpperCase() : null;
    let lockerId: string | null = claim.item.lockerId;

    if (lockerNum) {
      const locker = await prisma.locker.findUnique({ where: { lockerNumber: lockerNum } });
      if (!locker) return NextResponse.json({ success: false, error: "Locker not found" }, { status: 404 });
      if (locker.status !== "AVAILABLE") return NextResponse.json({ success: false, error: "Locker not available" }, { status: 400 });
      lockerId = locker.id;
    }

    // Everyone else waiting on this item loses automatically.
    const otherPending = await prisma.claim.findMany({
      where: { itemId: claim.itemId, status: "PENDING", NOT: { id } },
      select: { id: true, userId: true },
    });

    // Lost reports previously matched to this item are now resolved.
    const matchedReports = await prisma.report.findMany({
      where: { itemId: claim.itemId, type: "LOST", status: "MATCHED" },
      select: { id: true, userId: true },
    });

    const updated = await prisma.$transaction(async (tx) => {
      const itemData: { status: "CLAIMED"; lockerId?: string } = { status: "CLAIMED" };
      if (lockerId) itemData.lockerId = lockerId;
      await tx.item.update({ where: { id: claim.itemId }, data: itemData });

      if (lockerId && lockerId !== claim.item.lockerId) {
        if (claim.item.lockerId) {
          await tx.locker.update({ where: { id: claim.item.lockerId }, data: { status: "AVAILABLE" } });
        }
        await tx.locker.update({ where: { id: lockerId }, data: { status: "OCCUPIED" } });
      }

      if (otherPending.length) {
        await tx.claim.updateMany({
          where: { itemId: claim.itemId, status: "PENDING", NOT: { id } },
          data: { status: "REJECTED" },
        });
      }

      if (matchedReports.length) {
        await tx.report.updateMany({
          where: { itemId: claim.itemId, type: "LOST", status: "MATCHED" },
          data: { status: "CLOSED", reviewedAt: new Date() },
        });
      }

      return tx.claim.update({
        where: { id },
        data: { status: "APPROVED", approvedAt: new Date() },
      });
    });

    // Notify the winning student and everyone whose claim was closed.
    const assignedLockerNumber = lockerNum || claim.item.locker?.lockerNumber || null;
    await notifyUser(
      claim.userId,
      "Claim Approved",
      `Your claim for ${claim.item.itemName} has been approved.${
        assignedLockerNumber ? ` Locker ${assignedLockerNumber} is assigned.` : ""
      } View your QR code in My Claims. At the locker kiosk, scan your registered student ID barcode, then scan the QR code to open the locker and collect your item.`,
      { type: "CLAIM", link: "/dashboard/student/claims" },
    );

    await notifyUsers(
      otherPending.map((c) => ({
        userId: c.userId,
        title: "Claim Rejected",
        message: `Your claim for ${claim.item.itemName} was rejected because the item was claimed by another student.`,
        type: "CLAIM" as const,
        link: "/dashboard/student/claims",
      })),
    );

    await notifyUsers(
      matchedReports
        .filter((r) => r.userId !== claim.userId)
        .map((r) => ({
          userId: r.userId,
          title: "Lost Report Closed",
          message: `The item you reported lost (${claim.item.itemName}) has been claimed by another student, so your report was closed.`,
          type: "REPORT" as const,
          link: "/dashboard/student/report?tab=reports",
        })),
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
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
    const claim = await prisma.claim.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
    if (!claim) return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    if (claim.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your claim" }, { status: 403 });
    }
    if (claim.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `Claim already ${claim.status.toLowerCase()}` }, { status: 409 });
    }

    await prisma.claim.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    console.error("Claim cancel failed", e);
    return NextResponse.json({ success: false, error: "Failed to cancel claim" }, { status: 500 });
  }
}
