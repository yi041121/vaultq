import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyInventoryMatches } from "@/lib/match-notification-service";
import { ImageValidationError, normalizeImageSource } from "@/lib/image-validation";

const VALID_STATUS = ["FOUND", "CLAIMED", "RETRIEVED", "EXPIRED"] as const;
const READ_ONLY_STATUSES = ["CLAIMED", "RETRIEVED"] as const;
class ItemWriteConflict extends Error {}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/items/:id — item details (auth required)
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        locker: { select: { lockerNumber: true, status: true } },
        claims: {
          select: { id: true, status: true, userId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        // Item photos live on the verified FOUND reports only. Matched LOST
        // reports also point at this item, but their photos belong to the
        // lost-report view, never the item details.
        reports: {
          where: { type: "FOUND", status: "VERIFIED" },
          select: { imageUrls: true },
        },
      },
    });
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    if (user.role === "STUDENT" && item.status !== "FOUND" && !item.claims.some(claim => claim.userId === user.id)) {
      return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    }

    if (user.role === "STUDENT") {
      // Do not leak the storage locker or other students' claims. An approved
      // claim response is where the student receives their pickup details.
      return NextResponse.json({
        success: true,
        data: {
          ...item,
          locker: null,
          claims: item.claims.filter((claim) => claim.userId === user.id),
        },
      });
    }

    return NextResponse.json({ success: true, data: item });
  } catch (e) {
    console.error("Item fetch failed", e);
    return NextResponse.json({ success: false, error: "Failed to fetch item" }, { status: 500 });
  }
}

// PATCH /api/items/:id — admin updates item
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const body = await request.json();
    const { itemName, category, description, foundLocation, foundDate, imageUrl, status, lockerId } = body;

    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    if ((READ_ONLY_STATUSES as readonly string[]).includes(existing.status)) {
      return NextResponse.json({ success: false, error: "Claimed or retrieved items are view-only" }, { status: 409 });
    }

    if (status && !(VALID_STATUS as readonly string[]).includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const data: any = {};
    if (itemName !== undefined) {
      if (!String(itemName).trim()) return NextResponse.json({ success: false, error: "itemName cannot be empty" }, { status: 400 });
      data.itemName = String(itemName).trim();
    }
    if (category !== undefined) data.category = category || null;
    if (description !== undefined) data.description = description || null;
    if (foundLocation !== undefined) data.foundLocation = String(foundLocation).trim() || null;
    if (foundDate !== undefined) data.foundDate = foundDate ? new Date(foundDate) : null;
    if (imageUrl !== undefined) data.imageUrl = imageUrl === null || imageUrl === "" ? null : await normalizeImageSource(imageUrl);
    if (status !== undefined) data.status = status;

    // Locker reassignment
    if (lockerId !== undefined) {
      if (lockerId) {
        const locker = await prisma.locker.findUnique({ where: { id: lockerId } });
        if (!locker) return NextResponse.json({ success: false, error: "Locker not found" }, { status: 404 });
        if (locker.status !== "AVAILABLE" && existing.lockerId !== lockerId) {
          return NextResponse.json({ success: false, error: "Locker not available" }, { status: 400 });
        }
      }
      const updated = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "items" WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) throw new ItemWriteConflict("Item no longer exists");
        const fresh = await tx.item.findUnique({ where: { id } });
        if (!fresh || (READ_ONLY_STATUSES as readonly string[]).includes(fresh.status)) throw new ItemWriteConflict("The item was claimed and is now view-only");
        if (fresh.lockerId !== existing.lockerId) throw new ItemWriteConflict("Locker assignment changed. Refresh before moving this item.");
        for (const targetId of [...new Set([fresh.lockerId, lockerId].filter((value): value is string => typeof value === "string" && !!value))].sort()) {
          await tx.$queryRaw`SELECT id FROM "lockers" WHERE id = ${targetId} FOR UPDATE`;
        }
        if (lockerId) {
          const target = await tx.locker.findUnique({ where: { id: lockerId }, include: { item: { select: { id: true } } } });
          if (lockerId === fresh.lockerId) {
            if (!target || target.status !== "OCCUPIED" || target.item?.id !== id) throw new ItemWriteConflict("Assigned locker is not ready. Refresh before editing.");
          } else if (!target || target.status !== "AVAILABLE" || target.item) throw new ItemWriteConflict("Locker is no longer available");
        }
        // Guard the write itself: a claim may be approved after the initial read.
        const changed = await tx.item.updateMany({
          where: { id, status: { notIn: [...READ_ONLY_STATUSES] }, lockerId: existing.lockerId },
          data: { ...data, lockerId: lockerId || null },
        });
        if (!changed.count) throw new ItemWriteConflict("The item was claimed and is now view-only");
        // Free old locker
        if (existing.lockerId && existing.lockerId !== lockerId) {
          await tx.locker.updateMany({ where: { id: existing.lockerId, status: "OCCUPIED", item: { is: null } }, data: { status: "AVAILABLE" } });
        }
        if (lockerId) {
          await tx.locker.update({ where: { id: lockerId }, data: { status: "OCCUPIED" } });
        }
        return tx.item.findUnique({ where: { id } });
      });
      if (updated) await notifyInventoryMatches({ itemId: updated.id });
      return NextResponse.json({ success: true, data: updated });
    }

    const item = await prisma.$transaction(async (tx) => {
      const changed = await tx.item.updateMany({ where: { id, status: { notIn: [...READ_ONLY_STATUSES] } }, data });
      if (!changed.count) throw new ItemWriteConflict("The item was claimed and is now view-only");
      return tx.item.findUnique({ where: { id } });
    });
    if (item) await notifyInventoryMatches({ itemId: item.id });
    return NextResponse.json({ success: true, data: item });
  } catch (e) {
    if (e instanceof ImageValidationError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (e instanceof ItemWriteConflict) return NextResponse.json({ success: false, error: e.message }, { status: 409 });
    console.error("Item update failed", e);
    return NextResponse.json({ success: false, error: "Failed to update item" }, { status: 500 });
  }
}

// DELETE /api/items/:id — admin removes item (blocked if claims reference it)
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const existing = await prisma.item.findUnique({ where: { id }, include: { _count: { select: { claims: true } } } });
    if (!existing) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    if ((READ_ONLY_STATUSES as readonly string[]).includes(existing.status)) {
      return NextResponse.json({ success: false, error: "Claimed or retrieved items are view-only" }, { status: 409 });
    }
    if (existing._count.claims > 0) {
      return NextResponse.json({ success: false, error: "Cannot delete item with existing claims" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.item.deleteMany({ where: { id, lockerId: existing.lockerId, status: { notIn: [...READ_ONLY_STATUSES] }, claims: { none: {} } } });
      if (!deleted.count) throw new ItemWriteConflict("The item has claims or is now view-only");
      if (existing.lockerId) {
        await tx.locker.updateMany({ where: { id: existing.lockerId, status: "OCCUPIED", item: { is: null } }, data: { status: "AVAILABLE" } });
      }
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    if (e instanceof ItemWriteConflict) return NextResponse.json({ success: false, error: e.message }, { status: 409 });
    console.error("Item delete failed", e);
    return NextResponse.json({ success: false, error: "Failed to delete item" }, { status: 500 });
  }
}
