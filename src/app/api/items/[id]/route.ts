import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { startsWithNumber } from "@/lib/text-validation";

const VALID_STATUS = ["FOUND", "CLAIMED", "RETRIEVED", "EXPIRED"] as const;

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
        ...(user.role === "ADMIN" ? { reports: { select: { imageUrls: true } } } : {}),
      },
    });
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

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

    if (status && !(VALID_STATUS as readonly string[]).includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const data: any = {};
    if (itemName !== undefined) {
      if (!String(itemName).trim()) return NextResponse.json({ success: false, error: "itemName cannot be empty" }, { status: 400 });
      if (startsWithNumber(String(itemName))) {
        return NextResponse.json({ success: false, error: "Item name cannot start with a number" }, { status: 400 });
      }
      data.itemName = String(itemName).trim();
    }
    if (category !== undefined) data.category = category || null;
    if (description !== undefined) data.description = description || null;
    if (foundLocation !== undefined) data.foundLocation = String(foundLocation).trim() || null;
    if (foundDate !== undefined) data.foundDate = foundDate ? new Date(foundDate) : null;
    if (imageUrl !== undefined) data.imageUrl = imageUrl || null;
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
        // Free old locker
        if (existing.lockerId && existing.lockerId !== lockerId) {
          await tx.locker.update({ where: { id: existing.lockerId }, data: { status: "AVAILABLE" } });
        }
        const item = await tx.item.update({ where: { id }, data: { ...data, lockerId: lockerId || null } });
        if (lockerId) {
          await tx.locker.update({ where: { id: lockerId }, data: { status: "OCCUPIED" } });
        }
        return item;
      });
      return NextResponse.json({ success: true, data: updated });
    }

    const item = await prisma.item.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: item });
  } catch (e) {
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
    if (existing._count.claims > 0) {
      return NextResponse.json({ success: false, error: "Cannot delete item with existing claims" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      if (existing.lockerId) {
        await tx.locker.update({ where: { id: existing.lockerId }, data: { status: "AVAILABLE" } });
      }
      await tx.item.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    console.error("Item delete failed", e);
    return NextResponse.json({ success: false, error: "Failed to delete item" }, { status: 500 });
  }
}
