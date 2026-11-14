import { NextRequest, NextResponse } from "next/server";
import { collectPickup, PickupError } from "@/lib/pickup-service";
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

  let body: { token?: unknown; sessionToken?: unknown; deviceId?: unknown; dryRun?: unknown } | null;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    body = input;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "locker-01";
  const dryRun = body?.dryRun === true && process.env.NODE_ENV !== "production";

  if (!token || token.length > 256) {
    return NextResponse.json({ success: false, error: "QR token required" }, { status: 400 });
  }
  if (!sessionToken || sessionToken.length > 4096) {
    return NextResponse.json(
      { success: false, error: "Scan your student card barcode or student ID first" },
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
    const data = await collectPickup({
      token,
      expectedUserId: session.userId,
      expectedLockerNumber: LOCKER_NUMBER,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        unlockMs: UNLOCK_MS,
        dryRun,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PickupError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error("Hardware verify failed", error);
    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 500 });
  }
}
