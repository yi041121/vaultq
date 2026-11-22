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

function toCountMap(rows: Array<{ _count: { _all: number } }>, key: string) {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const value = (row as unknown as Record<string, unknown>)[key];
    out[String(value ?? "Uncategorised")] = row._count._all;
  }
  return out;
}

// GET /api/admin/reports/summary — aggregate counts behind the Reports page.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"), true);
  const createdAt = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const dated = createdAt ? { createdAt } : {};
  const auditDated = createdAt ? { createdAt } : {};

  try {
    const [
      itemStatus,
      itemCategory,
      reportType,
      reportStatus,
      claimStatus,
      lockerStatus,
      accountRole,
      accountActive,
      claimDates,
      reportDates,
      totalItems,
      totalReports,
      totalClaims,
      totalLockers,
      totalAccounts,
      totalAudit,
    ] = await Promise.all([
      prisma.item.groupBy({ by: ["status"], where: dated, _count: { _all: true } }),
      prisma.item.groupBy({ by: ["category"], where: dated, _count: { _all: true } }),
      prisma.report.groupBy({ by: ["type"], where: dated, _count: { _all: true } }),
      prisma.report.groupBy({ by: ["status"], where: dated, _count: { _all: true } }),
      prisma.claim.groupBy({ by: ["status"], where: dated, _count: { _all: true } }),
      prisma.locker.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.groupBy({ by: ["role"], where: dated, _count: { _all: true } }),
      prisma.user.groupBy({ by: ["isActive"], where: dated, _count: { _all: true } }),
      prisma.claim.findMany({ where: dated, select: { createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.report.findMany({ where: dated, select: { createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.item.count({ where: dated }),
      prisma.report.count({ where: dated }),
      prisma.claim.count({ where: dated }),
      prisma.locker.count(),
      prisma.user.count({ where: dated }),
      prisma.auditLog.count({ where: auditDated }),
    ]);

    const byMonth: Record<string, number> = {};
    for (const claim of claimDates) {
      const key = claim.createdAt.toISOString().slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + 1;
    }
    const reportsByMonth: Record<string, number> = {};
    for (const report of reportDates) {
      const key = report.createdAt.toISOString().slice(0, 7);
      reportsByMonth[key] = (reportsByMonth[key] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        range: { from: params.get("from"), to: params.get("to") },
        items: { total: totalItems, byStatus: toCountMap(itemStatus, "status"), byCategory: toCountMap(itemCategory, "category") },
        reports: { total: totalReports, byType: toCountMap(reportType, "type"), byStatus: toCountMap(reportStatus, "status"), byMonth: reportsByMonth },
        claims: { total: totalClaims, byStatus: toCountMap(claimStatus, "status"), byMonth },
        lockers: { total: totalLockers, byStatus: toCountMap(lockerStatus, "status") },
        accounts: {
          total: totalAccounts,
          byRole: toCountMap(accountRole, "role"),
          active: accountActive.find((row) => row.isActive)?._count._all || 0,
          inactive: accountActive.find((row) => !row.isActive)?._count._all || 0,
        },
        audit: { total: totalAudit },
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Report summary failed", error);
    return NextResponse.json({ success: false, error: "Failed to build the report" }, { status: 500 });
  }
}
