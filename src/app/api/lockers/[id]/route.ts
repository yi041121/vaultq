import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

const VALID_STATUS = ["AVAILABLE", "OCCUPIED", "MAINTENANCE"] as const;

type Ctx = { params: Promise<{ id: string }> };

// GET /api/lockers/:id — locker details (auth required)
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const locker = await prisma.locker.findUnique({
      where: { id },
      include: { item: { select: { id: true, itemName: true, category: true, status: true } } },
    });
    if (!locker) return NextResponse.json({ success: false, error: "Locker not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: locker });
  } catch (e) {
    console.error("Locker fetch failed", e);
    return NextResponse.json({ success: false, error: "Failed to fetch locker" }, { status: 500 });
  }
}

// PATCH /api/lockers/:id — admin: set status, assign item, or release
// Body: { status?: "AVAILABLE"|"MAINTENANCE", itemId?: string, release?: boolean }
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const body = await request.json();
    const { status, itemId, release } = body;

    const locker = await prisma.locker.findUnique({
      where: { id },
      include: { item: { select: { id: true } } },
    });
    if (!locker) return NextResponse.json({ success: false, error: "Locker not found" }, { status: 404 });

    // Release: free the item inside, locker becomes AVAILABLE
    if (release) {
      if (!locker.item) return NextResponse.json({ success: false, error: "Locker is already empty" }, { status: 400 });
      const updated = await prisma.$transaction(async (tx) => {
        await tx.item.update({ where: { id: locker.item!.id }, data: { lockerId: null } });
        return tx.locker.update({ where: { id }, data: { status: "AVAILABLE" } });
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Assign: put an item inside (locker must be AVAILABLE)
    if (itemId) {
      if (locker.status !== "AVAILABLE" || locker.item) {
        return NextResponse.json({ success: false, error: "Locker not available" }, { status: 400 });
      }
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      if (item.lockerId) return NextResponse.json({ success: false, error: "Item already in a locker" }, { status: 400 });
      const updated = await prisma.$transaction(async (tx) => {
        await tx.item.update({ where: { id: itemId }, data: { lockerId: id } });
        return tx.locker.update({ where: { id }, data: { status: "OCCUPIED" } });
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Status change
    if (status) {
      if (!(VALID_STATUS as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
      }
      if ((status === "MAINTENANCE" || status === "AVAILABLE") && locker.item && status === "MAINTENANCE") {
        return NextResponse.json({ success: false, error: "Release the item before maintenance" }, { status: 400 });
      }
      const updated = await prisma.locker.update({ where: { id }, data: { status: status as any } });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: "Nothing to update (status, itemId or release required)" }, { status: 400 });
  } catch (e) {
    console.error("Locker update failed", e);
    return NextResponse.json({ success: false, error: "Failed to update locker" }, { status: 500 });
  }
}

// DELETE /api/lockers/:id — admin removes empty locker
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const { id } = await params;

  try {
    const locker = await prisma.locker.findUnique({ where: { id }, include: { item: { select: { id: true } } } });
    if (!locker) return NextResponse.json({ success: false, error: "Locker not found" }, { status: 404 });
    if (locker.item) return NextResponse.json({ success: false, error: "Release the item before deleting locker" }, { status: 409 });

    await prisma.locker.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    console.error("Locker delete failed", e);
    return NextResponse.json({ success: false, error: "Failed to delete locker" }, { status: 500 });
  }
}
