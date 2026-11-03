import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// POST /api/notifications/read-all — mark every unread notification as read
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true, data: { updated: result.count } });
  } catch (e) {
    console.error("Notification read-all failed", e);
    return NextResponse.json({ success: false, error: "Failed to update notifications" }, { status: 500 });
  }
}
