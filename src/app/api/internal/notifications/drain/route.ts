import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { drainNotificationOutbox } from "@/lib/notification-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Call every minute from an authenticated scheduler. Never authorize a worker
 * using URL query parameters, browser role hints, or a hard-coded fallback. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ success: false, error: "Notification scheduler is not configured" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const data = await drainNotificationOutbox({ limit: 50, budgetMs: 20_000 });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, error: "Notification queue unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
