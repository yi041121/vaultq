import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { generatePickupQr, PickupError } from "@/lib/pickup-service";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const claimId = body && typeof body === "object" && "claimId" in body ? body.claimId : null;
  if (typeof claimId !== "string" || !claimId.trim() || claimId.length > 128) {
    return NextResponse.json({ success: false, error: "claimId required" }, { status: 400 });
  }
  try {
    const qr = await generatePickupQr(claimId.trim(), user);
    return NextResponse.json({ success: true, data: qr }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof PickupError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("QR generate failed", e);
    return NextResponse.json({ success: false, error: "Failed to generate QR" }, { status: 500 });
  }
}
