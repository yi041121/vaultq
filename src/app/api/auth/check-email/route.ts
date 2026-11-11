import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

// GET /api/auth/check-email?email=name@student.tarc.edu.my — public live check
// for the register form. Returns { exists }; fail-open (exists:false) so a
// transient DB error never blocks the user (submit re-validates strictly).
export async function GET(request: NextRequest) {
  const email = (new URL(request.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: true, data: { exists: false } });
  }
  try {
    const existing = await withDbRetry(() =>
      prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      })
    );
    return NextResponse.json({ success: true, data: { exists: !!existing } });
  } catch {
    return NextResponse.json({ success: true, data: { exists: false } });
  }
}
