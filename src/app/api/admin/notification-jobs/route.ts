import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  try {
    const [pending, failed, oldestPending, failures] = await Promise.all([
      prisma.notificationJob.count({ where: { completedAt: null, failedAt: null } }),
      prisma.notificationJob.count({ where: { failedAt: { not: null } } }),
      prisma.notificationJob.findFirst({ where: { completedAt: null, failedAt: null }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      prisma.notificationJob.findMany({ where: { failedAt: { not: null } }, orderBy: { failedAt: "desc" }, take: 50,
        select: { id: true, kind: true, attempts: true, failedAt: true, lastError: true } }),
    ]);
    return NextResponse.json({ success: true, data: { pending, failed, oldestPendingAt: oldestPending?.createdAt || null, failures } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ success: false, error: "Notification queue unavailable" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.id)) return NextResponse.json({ success: false, error: "Valid job ID required" }, { status: 400 });
  try {
    const changed = await prisma.$executeRaw`
      UPDATE "notification_jobs" SET attempts = 0, failed_at = NULL, last_error = NULL, available_at = clock_timestamp()
      WHERE id = ${body.id} AND failed_at IS NOT NULL AND completed_at IS NULL
    `;
    if (!changed) return NextResponse.json({ success: false, error: "Job is not awaiting manual retry" }, { status: 409 });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ success: false, error: "Could not retry notification job" }, { status: 503 }); }
}
