import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isItemCategory } from "@/lib/categories";
import { createItemRecord } from "@/lib/item-service";

const VALID_STATUS = ["FOUND", "CLAIMED", "RETRIEVED", "EXPIRED"] as const;

// GET /api/items?q=&status=&category= — list items (auth required)
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "";
    const category = searchParams.get("category") || "";

    const where: any = {};
    if (q) where.itemName = { contains: q, mode: "insensitive" };
    if (status && (VALID_STATUS as readonly string[]).includes(status)) {
      where.status = status as any;
    } else if (user.role !== "ADMIN") {
      // Students only browse items that are still claimable.
      where.status = "FOUND";
    }
    if (category) where.category = category;

    const include: any = {
      _count: { select: { claims: true } },
    };
    if (user.role === "ADMIN") {
      // Storage locations are operational data; students only learn the locker
      // after their claim is approved.
      include.locker = { select: { lockerNumber: true, status: true } };
    }
    if (user.role === "STUDENT") {
      // Lets the UI hide the claim button on items the student handed in.
      include.reports = {
        where: { userId: user.id, type: "FOUND", status: "VERIFIED" },
        select: { id: true },
        take: 1,
      };
    }

    const items = await prisma.item.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    console.error("Items list failed", e);
    return NextResponse.json({ success: false, error: "Failed to list items" }, { status: 500 });
  }
}

// POST /api/items — admin registers a found item
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  try {
    const body = await request.json();
    const { itemName, category, description, foundLocation, foundDate, lockerId, imageUrl, status } = body;

    if (!itemName?.trim()) return NextResponse.json({ success: false, error: "itemName required" }, { status: 400 });
    if (!foundLocation?.trim()) return NextResponse.json({ success: false, error: "foundLocation required" }, { status: 400 });
    if (category && !isItemCategory(category)) {
      return NextResponse.json({ success: false, error: "Invalid category" }, { status: 400 });
    }
    if (status && !(VALID_STATUS as readonly string[]).includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    if (lockerId) {
      const locker = await prisma.locker.findUnique({ where: { id: lockerId } });
      if (!locker) return NextResponse.json({ success: false, error: "Locker not found" }, { status: 404 });
      if (locker.status !== "AVAILABLE") return NextResponse.json({ success: false, error: "Locker not available" }, { status: 400 });
    }

    const item = await prisma.$transaction((tx) =>
      createItemRecord(tx, user.id, {
        itemName,
        category,
        description,
        foundLocation,
        foundDate,
        imageUrl,
        lockerId,
        status: (status as any) || "FOUND",
      }),
    );

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (e) {
    console.error("Item creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to create item" }, { status: 500 });
  }
}
