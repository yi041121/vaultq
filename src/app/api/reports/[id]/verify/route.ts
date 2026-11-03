import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isItemCategory } from "@/lib/categories";
import { createItemRecord } from "@/lib/item-service";
import { notifyUser } from "@/lib/notification-service";
import { REPORT_INCLUDE } from "@/lib/report-include";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/reports/:id/verify — admin verifies a found report and either
// links it to an existing item or creates the inventory item atomically.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const body = await request.json();
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    if (report.type !== "FOUND") {
      return NextResponse.json({ success: false, error: "Only found reports can be verified" }, { status: 400 });
    }
    if (report.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `Report is already ${report.status.toLowerCase()}` }, { status: 409 });
    }

    // Option 1: link an item that staff already logged.
    if (body.itemId) {
      const item = await prisma.item.findUnique({
        where: { id: body.itemId },
        select: { id: true, itemName: true, status: true },
      });
      if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      if (item.status !== "FOUND") {
        return NextResponse.json({ success: false, error: "Item is no longer available" }, { status: 400 });
      }

      const updated = await prisma.report.update({
        where: { id },
        data: { status: "VERIFIED", itemId: item.id, reviewedById: user.id, reviewedAt: new Date() },
        include: REPORT_INCLUDE,
      });

      await notifyUser(
        report.userId,
        "Found Item Verified",
        `Your found item report for ${report.itemName} was verified and linked to an existing item. Thank you for handing it in.`,
        { type: "REPORT", link: "/dashboard/student/report?tab=reports" },
      );

      return NextResponse.json({ success: true, data: updated });
    }

    // Option 2: create the item from the report details.
    const input = body.create || {};
    const itemName = String(input.itemName || report.itemName).trim();
    const foundLocation = String(input.location || report.location || "").trim();
    const category = input.category ?? report.category;
    const description = input.description ?? report.description;
    const imageUrl = input.imageUrl ?? report.imageUrl;
    const rawDate = input.date ?? report.date;
    const lockerId = input.lockerId || null;

    if (!itemName) return NextResponse.json({ success: false, error: "Item name required" }, { status: 400 });
    if (!foundLocation) return NextResponse.json({ success: false, error: "Found location required" }, { status: 400 });
    if (category && !isItemCategory(category)) {
      return NextResponse.json({ success: false, error: "Invalid category" }, { status: 400 });
    }

    if (lockerId) {
      const locker = await prisma.locker.findUnique({ where: { id: lockerId } });
      if (!locker) return NextResponse.json({ success: false, error: "Locker not found" }, { status: 404 });
      if (locker.status !== "AVAILABLE") {
        return NextResponse.json({ success: false, error: "Locker not available" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const item = await createItemRecord(tx, user.id, {
        itemName,
        category,
        description,
        foundLocation,
        foundDate: rawDate,
        imageUrl,
        lockerId,
      });

      const updated = await tx.report.update({
        where: { id },
        data: { status: "VERIFIED", itemId: item.id, reviewedById: user.id, reviewedAt: new Date() },
        include: REPORT_INCLUDE,
      });

      return { item, report: updated };
    });

    await notifyUser(
      report.userId,
      "Found Item Verified",
      `Your found item report for ${report.itemName} was verified and added to the Lost & Found inventory. Thank you for handing it in.`,
      { type: "REPORT", link: "/dashboard/student/report?tab=reports" },
    );

    return NextResponse.json({ success: true, data: result.report });
  } catch (e) {
    console.error("Found report verification failed", e);
    return NextResponse.json({ success: false, error: "Failed to verify report" }, { status: 500 });
  }
}
