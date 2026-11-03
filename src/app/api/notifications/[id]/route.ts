import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/notifications/:id — mark one notification as read
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!notification) return NextResponse.json({ success: false, error: "Notification not found" }, { status: 404 });
    if (notification.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your notification" }, { status: 403 });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("Notification update failed", e);
    return NextResponse.json({ success: false, error: "Failed to update notification" }, { status: 500 });
  }
}
