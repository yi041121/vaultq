import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  LOCKER_NUMBER,
  UNLOCK_MS,
  isDeviceKeyValid,
  isHardwareConfigured,
  readLockerSession,
} from "@/lib/hardware-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 2 of the locker flow: verify the pickup QR belongs to the student who
 * just scanned their card, and to this locker.
 *
 * POST /api/hardware/verify
 * Header: x-device-key: <HARDWARE_API_KEY>
 * Body: { deviceId, sessionToken, token, dryRun? }
 *
 * On success the QR is marked used, the item is marked retrieved, and the
 * locker is freed. dryRun is for development testing only.
 */
export async function POST(request: NextRequest) {
  if (!isHardwareConfigured()) {
    return NextResponse.json(
      { success: false, error: "Hardware API is not configured" },
      { status: 500 },
    );
  }

  if (!isDeviceKeyValid(request.headers.get("x-device-key"))) {
    return NextResponse.json({ success: false, error: "Unauthorized device" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "locker-01";
  const dryRun = body?.dryRun === true && process.env.NODE_ENV !== "production";

  if (!token) {
    return NextResponse.json({ success: false, error: "QR token required" }, { status: 400 });
  }
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: "Scan your student ID first" },
      { status: 401 },
    );
  }

  const session = readLockerSession(sessionToken);
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Student card session expired — scan your card again" },
      { status: 401 },
    );
  }
  if (session.deviceId !== deviceId || session.locker !== LOCKER_NUMBER) {
    return NextResponse.json(
      { success: false, error: "Session belongs to another locker" },
      { status: 401 },
    );
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
    if (qr.claim.userId !== session.userId) {
      return NextResponse.json(
        { success: false, error: "This QR belongs to another student" },
        { status: 403 },
      );
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
      `Hardware verify: device=${deviceId} student=${session.userId} locker=${lockerNumber} claim=${qr.claimId}` +
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
