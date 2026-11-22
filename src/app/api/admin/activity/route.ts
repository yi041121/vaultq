import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

// GET /api/admin/activity — paginated audit trail for the Activity page.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 100);
  const action = (params.get("action") || "ALL").trim();
  const entityType = (params.get("entityType") || "ALL").trim();
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"), true);
  const page = Math.max(1, Number(params.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(params.get("pageSize") || 20) || 20));

  const where = {
    ...(action !== "ALL" ? { action } : {}),
    ...(entityType !== "ALL" ? { entityType } : {}),
    ...(q
      ? {
          OR: [
            { summary: { contains: q, mode: "insensitive" as const } },
            { actorName: { contains: q, mode: "insensitive" as const } },
            { entityId: { contains: q } },
          ],
        }
      : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  try {
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json(
      { success: true, data: rows, total, page, pageSize },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Activity list failed", error);
    return NextResponse.json({ success: false, error: "Failed to load activity" }, { status: 500 });
  }
}
