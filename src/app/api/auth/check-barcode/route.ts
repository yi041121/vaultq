import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

// GET /api/auth/check-barcode?code=2000132602 — public live check for register form.
// Returns { exists } only for exact 10-digit codes; fail-open (exists:false)
// so a transient DB error never blocks the user (submit re-validates strictly).
export async function GET(request: NextRequest) {
  const code = new URL(request.url).searchParams.get("code") || "";
  if (!/^[0-9]{10}$/.test(code)) {
    return NextResponse.json({ success: true, data: { exists: false } });
  }
  try {
    const existing = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { cardBarcode: code },
        select: { id: true },
      })
    );
    return NextResponse.json({ success: true, data: { exists: !!existing } });
  } catch {
    return NextResponse.json({ success: true, data: { exists: false } });
  }
}
