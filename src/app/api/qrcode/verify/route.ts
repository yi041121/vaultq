import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { token } = await request.json();
    if (!token) return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });

    const qr = await prisma.qrCode.findUnique({
      where: { qrToken: token },
      include: { claim: { include: { item: true } } },
    });

    if (!qr) return NextResponse.json({ success: false, error: "Invalid QR token" }, { status: 404 });
    if (qr.isUsed) return NextResponse.json({ success: false, error: "QR already used" }, { status: 410 });
    if (new Date(qr.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: "QR expired" }, { status: 410 });
    }
    // Check ownership: student can only use own claim's QR, admin can use any
    if (user.role === "STUDENT" && qr.claim.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your QR" }, { status: 403 });
    }

    // Mark as used and unlock locker
    await prisma.$transaction(async (tx) => {
      await tx.qrCode.update({ where: { id: qr.id }, data: { isUsed: true } });
      await tx.claim.update({ where: { id: qr.claimId }, data: { status: "APPROVED" } });
      if (qr.claim.item.lockerId) {
        await tx.locker.update({ where: { id: qr.claim.item.lockerId }, data: { status: "AVAILABLE" } });
        await tx.item.update({ where: { id: qr.claim.itemId }, data: { status: "RETRIEVED" } });
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        claimId: qr.claimId,
        locker: qr.claim.item.lockerId,
        itemName: qr.claim.item.itemName,
      },
    });
  } catch (e) {
    console.error("QR verify failed", e);
    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 500 });
  }
}
