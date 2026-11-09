import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tiny payload for the admin sidebar badges. Fetching the full claims/reports
 * lists just to count them transferred every evidence image and made every
 * admin page slow, especially over the phone tunnel.
 */
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  }

  try {
    const [pendingClaims, pendingFound, pendingLost] = await Promise.all([
      prisma.claim.count({ where: { status: "PENDING" } }),
      prisma.report.count({ where: { type: "FOUND", status: "PENDING" } }),
      prisma.report.count({ where: { type: "LOST", status: "PENDING" } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        claims: pendingClaims + pendingLost,
        intake: pendingFound,
      },
    });
  } catch (error) {
    console.error("Nav counts failed", error);
    return NextResponse.json({ success: false, error: "Failed to count pending items" }, { status: 500 });
  }
}
