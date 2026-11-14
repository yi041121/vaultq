import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { collectPickup, PickupError } from "@/lib/pickup-service";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // QR codes are presented by students and verified by staff or a kiosk
  // service account, never by the student's own device.
  if (user.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "Staff only" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const token = body && typeof body === "object" && "token" in body ? body.token : null;
  if (typeof token !== "string" || !token.trim() || token.length > 256) {
    return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
  }
  try {
    const data = await collectPickup({ token: token.trim() });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof PickupError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("QR verify failed", e);
    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 500 });
  }
}
