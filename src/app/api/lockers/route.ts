import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

const VALID_STATUS = ["AVAILABLE", "OCCUPIED", "MAINTENANCE"] as const;

// GET /api/lockers?status= — list lockers (auth required)
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";

    const where: any = {};
    if (status && (VALID_STATUS as readonly string[]).includes(status)) where.status = status as any;

    const lockers = await prisma.locker.findMany({
      where,
      include: {
        item: { select: { id: true, itemName: true, category: true, status: true, imageUrl: true } },
      },
      orderBy: { lockerNumber: "asc" },
    });

    return NextResponse.json({ success: true, data: lockers });
  } catch (e) {
    console.error("Lockers list failed", e);
    return NextResponse.json({ success: false, error: "Failed to list lockers" }, { status: 500 });
  }
}

// POST /api/lockers — admin adds a locker
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  try {
    const body = await request.json();
    const lockerNumber = String(body.lockerNumber || "").trim().toUpperCase();
    if (!lockerNumber) return NextResponse.json({ success: false, error: "lockerNumber required" }, { status: 400 });

    const existing = await prisma.locker.findUnique({ where: { lockerNumber } });
    if (existing) return NextResponse.json({ success: false, error: "Locker number already exists" }, { status: 409 });

    const locker = await prisma.locker.create({ data: { lockerNumber } });
    return NextResponse.json({ success: true, data: locker }, { status: 201 });
  } catch (e) {
    console.error("Locker creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to create locker" }, { status: 500 });
  }
}
