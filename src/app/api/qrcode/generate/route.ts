import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { claimId } = await request.json();
    if (!claimId) return NextResponse.json({ success: false, error: "claimId required" }, { status: 400 });

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { item: true },
    });
    if (!claim) return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    // Only owner or admin can generate
    if (user.role === "STUDENT" && claim.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your claim" }, { status: 403 });
    }
    if (claim.status !== "APPROVED") {
      return NextResponse.json({ success: false, error: "Claim must be approved first" }, { status: 400 });
    }

    // Check existing valid QR
    const existing = await prisma.qrCode.findUnique({ where: { claimId } });
    if (existing && !existing.isUsed && new Date(existing.expiresAt).getTime() > Date.now()) {
      return NextResponse.json({ success: true, data: existing });
    }

    // Create new QR valid 24h
    const qr = await prisma.qrCode.upsert({
      where: { claimId },
      create: {
        claimId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({ success: true, data: qr });
  } catch (e) {
    console.error("QR generate failed", e);
    return NextResponse.json({ success: false, error: "Failed to generate QR" }, { status: 500 });
  }
}
