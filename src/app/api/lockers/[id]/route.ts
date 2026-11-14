import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { changeLocker, deleteEmptyLocker, LockerManagementError } from "@/lib/locker-management-service";

const VALID_STATUS = ["AVAILABLE", "OCCUPIED", "MAINTENANCE"] as const;

type Ctx = { params: Promise<{ id: string }> };

// GET /api/lockers/:id — locker details (auth required)
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Invalid locker details" }, { status: 400 });
    const { status, itemId, release } = body;
    if (status !== undefined && !(VALID_STATUS as readonly unknown[]).includes(status)) return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    if (itemId !== undefined && (typeof itemId !== "string" || !itemId.trim())) return NextResponse.json({ success: false, error: "Invalid item ID" }, { status: 400 });
    if (release !== undefined && typeof release !== "boolean") return NextResponse.json({ success: false, error: "Invalid release flag" }, { status: 400 });
    if (Number(status !== undefined) + Number(itemId !== undefined) + Number(release === true) !== 1) return NextResponse.json({ success: false, error: "Choose exactly one locker action" }, { status: 400 });
    const updated = await changeLocker(id, { status, itemId, release });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof LockerManagementError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
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
    return NextResponse.json({ success: true, data: await deleteEmptyLocker(id) });
  } catch (e) {
    if (e instanceof LockerManagementError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("Locker delete failed", e);
    return NextResponse.json({ success: false, error: "Failed to delete locker" }, { status: 500 });
  }
}
