import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isItemCategory } from "@/lib/categories";
import { createItemRecord, ItemAllocationConflict } from "@/lib/item-service";
import { notifyUser } from "@/lib/notification-service";
import { REPORT_INCLUDE } from "@/lib/report-include";
import { notifyInventoryMatches } from "@/lib/match-notification-service";
import { ImageValidationError, normalizeImageSource } from "@/lib/image-validation";

type Ctx = { params: Promise<{ id: string }> };
class VerificationConflict extends Error {}

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

    // Compare the reviewed revision in the write itself. Parallel verification,
    // rejection or student edits must not be overwritten by an old snapshot.
    const expected = {
      id, type: "FOUND" as const, status: "PENDING" as const, itemId: null,
      itemName: report.itemName, category: report.category, description: report.description,
      location: report.location, date: report.date, imageUrl: report.imageUrl,
      imageUrls: { equals: report.imageUrls },
    };

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

      const updated = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "items" WHERE id = ${item.id} FOR UPDATE`;
        const fresh = await tx.item.findUnique({ where: { id: item.id }, select: { status: true } });
        if (!fresh || fresh.status !== "FOUND") throw new VerificationConflict("Item is no longer available");
        const changed = await tx.report.updateMany({ where: expected, data: { status: "VERIFIED", itemId: item.id, reviewedById: user.id, reviewedAt: new Date() } });
        if (changed.count !== 1) throw new VerificationConflict("Report changed or was already reviewed. Refresh before verifying.");
        return tx.report.findUniqueOrThrow({ where: { id }, include: REPORT_INCLUDE });
      });

      await notifyUser(
        report.userId,
        "Found Item Verified",
        `Your found item report for ${report.itemName} was verified and linked to an existing item. Thank you for handing it in.`,
        { type: "REPORT", link: "/dashboard/student/report?tab=reports&kind=FOUND" },
      );

      await notifyInventoryMatches({ itemId: item.id });
      return NextResponse.json({ success: true, data: updated });
    }

    // Option 2: create the item from the report details.
    const input = body.create || {};
    const itemName = String(input.itemName || report.itemName).trim();
    const foundLocation = String(input.location || report.location || "").trim();
    const category = input.category ?? report.category;
    const description = input.description ?? report.description;
    const source = input.imageUrl ?? report.imageUrl;
    const imageUrl = source == null || source === "" ? null : await normalizeImageSource(source);
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
      const reserved = await tx.report.updateMany({ where: expected, data: { status: "VERIFIED", reviewedById: user.id, reviewedAt: new Date() } });
      if (reserved.count !== 1) throw new VerificationConflict("Report changed or was already reviewed. Refresh before verifying.");
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
      { type: "REPORT", link: "/dashboard/student/report?tab=reports&kind=FOUND" },
    );

    await notifyInventoryMatches({ itemId: result.item.id });
    return NextResponse.json({ success: true, data: result.report });
  } catch (e) {
    if (e instanceof ImageValidationError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (e instanceof VerificationConflict || e instanceof ItemAllocationConflict) return NextResponse.json({ success: false, error: e.message }, { status: 409 });
    console.error("Found report verification failed", e);
    return NextResponse.json({ success: false, error: "Failed to verify report" }, { status: 500 });
  }
}
