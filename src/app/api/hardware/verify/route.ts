import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_KEY = process.env.HARDWARE_API_KEY;
const LOCKER_NUMBER = process.env.LOCKER_NUMBER || "B03";
const UNLOCK_MS = 5000;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Locker hardware verification.
 *
 * POST /api/hardware/verify
 * Header: x-device-key: <HARDWARE_API_KEY>
 * Body: { deviceId, token, dryRun? }
 *
 * The ESP32 scanner sends the QR token here. On success, the QR is marked
 * used, the item is marked retrieved, and the locker is freed.
 *
 * dryRun is for development testing only: it validates without changing data.
 */
export async function POST(request: NextRequest) {
  if (!DEVICE_KEY) {
    return NextResponse.json(
      { success: false, error: "Hardware API is not configured" },
      { status: 500 },
    );
  }

  const deviceKey = request.headers.get("x-device-key") || "";
  if (!safeEqual(deviceKey, DEVICE_KEY)) {
    return NextResponse.json({ success: false, error: "Unauthorized device" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "locker-01";
  const dryRun = body?.dryRun === true && process.env.NODE_ENV !== "production";

  if (!token) {
    return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
  }

  try {
    const qr = await prisma.qrCode.findUnique({
      where: { qrToken: token },
      include: {
        claim: {
          include: {
            item: { include: { locker: true } },
          },
        },
      },
    });

    if (!qr) {
      return NextResponse.json({ success: false, error: "Invalid QR token" }, { status: 404 });
    }
    if (qr.isUsed) {
      return NextResponse.json({ success: false, error: "QR already used" }, { status: 410 });
    }
    if (qr.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: "QR expired" }, { status: 410 });
    }
    if (qr.claim.status !== "APPROVED") {
      return NextResponse.json({ success: false, error: "Claim is not approved" }, { status: 409 });
    }
    if (qr.claim.item.status === "RETRIEVED") {
      return NextResponse.json({ success: false, error: "Item already collected" }, { status: 409 });
    }

    const lockerNumber = qr.claim.item.locker?.lockerNumber || null;
    if (!lockerNumber || lockerNumber !== LOCKER_NUMBER) {
      return NextResponse.json(
        {
          success: false,
          error: `QR belongs to locker ${lockerNumber || "unassigned"}, not ${LOCKER_NUMBER}`,
        },
        { status: 409 },
      );
    }

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        await tx.qrCode.update({ where: { id: qr.id }, data: { isUsed: true } });
        if (qr.claim.item.lockerId) {
          await tx.locker.update({
            where: { id: qr.claim.item.lockerId },
            data: { status: "AVAILABLE" },
          });
        }
        await tx.item.update({
          where: { id: qr.claim.itemId },
          data: { status: "RETRIEVED", lockerId: null },
        });
      });
    }

    console.log(
      `Hardware verify: device=${deviceId} locker=${lockerNumber} claim=${qr.claimId}` +
        (dryRun ? " [dry-run]" : ""),
    );

    return NextResponse.json({
      success: true,
      data: {
        claimId: qr.claimId,
        locker: lockerNumber,
        itemName: qr.claim.item.itemName,
        unlockMs: UNLOCK_MS,
        dryRun,
      },
    });
  } catch (error) {
    console.error("Hardware verify failed", error);
    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 500 });
  }
}
