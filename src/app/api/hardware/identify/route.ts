import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_SECONDS,
  createLockerSession,
  authenticateHardwareDevice,
  isHardwareConfigured,
} from "@/lib/hardware-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 1 of the locker flow: identify the student from their student card
 * barcode. Returns a short-lived session token that must be presented with
 * the pickup QR in /api/hardware/verify.
 *
 * POST /api/hardware/identify
 * Header: x-device-key: <this device's registered apiKey>
 * Body: { deviceId, cardBarcode }
 */
export async function POST(request: NextRequest) {
  if (!isHardwareConfigured()) {
    return NextResponse.json(
      { success: false, error: "Hardware API is not configured" },
      { status: 500 },
    );
  }
  let body: { cardBarcode?: unknown; deviceId?: unknown };
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    body = input;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const cardBarcode = typeof body?.cardBarcode === "string" ? body.cardBarcode.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
  const device = authenticateHardwareDevice(deviceId, request.headers.get("x-device-key"));
  if (!device) return NextResponse.json({ success: false, error: "Unauthorized device" }, { status: 401 });

  if (!cardBarcode || !/^[A-Za-z0-9]{6,32}$/.test(cardBarcode)) {
    return NextResponse.json({ success: false, error: "Card barcode required" }, { status: 400 });
  }

  try {
    const student = await prisma.user.findFirst({
      where: {
        isActive: true,
        role: "STUDENT",
        OR: [{ cardBarcode }, { studentId: cardBarcode }],
      },
      select: { id: true, name: true },
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: "Student card not recognized" },
        { status: 404 },
      );
    }

    const sessionToken = createLockerSession(student.id, device);

    console.log(`Hardware identify: device=${deviceId} student=${student.id}`);

    return NextResponse.json({
      success: true,
      data: {
        sessionToken,
        studentName: student.name,
        expiresIn: SESSION_SECONDS,
      },
    });
  } catch (error) {
    console.error("Hardware identify failed", error);
    return NextResponse.json({ success: false, error: "Identification failed" }, { status: 500 });
  }
}
