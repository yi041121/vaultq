import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// GET /api/notifications?count=1 — own notifications + unread count
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "1";
    const countOnly = searchParams.get("count") === "1";

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });

    if (countOnly) {
      return NextResponse.json({ success: true, data: { unreadCount } });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, data: notifications, unreadCount });
  } catch (e) {
    console.error("Notifications list failed", e);
    return NextResponse.json({ success: false, error: "Failed to list notifications" }, { status: 500 });
  }
}
