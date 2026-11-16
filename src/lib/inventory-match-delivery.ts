import type { Prisma } from "@/generated/prisma/client";
import { suggestMatches } from "./report-match";

/** One bounded item/report page. Called within the worker's delivery transaction.
 * Failures roll back this job only; other jobs are still processed. */
export async function deliverInventoryMatchBatch(tx: Prisma.TransactionClient, scope: { itemId: string; reportId?: string; cursor?: string }, limit = 100): Promise<string | null> {
  const id = scope.itemId;
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`match-alert:${id}`}))`;
  const item = await tx.item.findUnique({ where: { id }, select: {
    id: true, itemName: true, category: true, description: true, foundLocation: true, foundDate: true, status: true,
    reports: { where: { type: "FOUND", status: "VERIFIED" }, select: { userId: true } },
    claims: { where: { status: { in: ["PENDING", "APPROVED"] } }, select: { userId: true } },
  } });
  if (!item || item.status !== "FOUND") return null;
  const excludedUsers = [...item.reports, ...item.claims].map(entry => entry.userId);
  const rows = await tx.report.findMany({
    where: {
      type: "LOST", status: "PENDING", itemId: null,
      ...(scope.reportId ? { id: scope.reportId } : scope.cursor ? { id: { gt: scope.cursor } } : {}),
      userId: { notIn: excludedUsers }, user: { isActive: true },
    },
    select: { id: true, userId: true, itemName: true, category: true, description: true, location: true, date: true },
    orderBy: { id: "asc" }, take: limit + 1,
  });
  const candidate = { ...item, foundDate: item.foundDate?.toISOString() || null };
  const alerts = rows.slice(0, limit).flatMap(report => {
    if (!suggestMatches({ ...report, date: report.date?.toISOString() || null }, [candidate]).length) return [];
    return [{
      userId: report.userId, title: "Possible Match Found", type: "REPORT" as const,
      message: `An inventory item (${item.itemName}) may match your lost report for ${report.itemName}. Review the item and submit a claim if it is yours. This is not an ownership confirmation.`,
      link: `/dashboard/student/search?item=${encodeURIComponent(id)}&report=${encodeURIComponent(report.id)}`,
    }];
  });
  if (alerts.length) {
    const existing = await tx.notification.findMany({ where: { link: { in: alerts.map(alert => alert.link) } }, select: { userId: true, link: true } });
    const keys = new Set(existing.map(alert => `${alert.userId}:${alert.link}`));
    const fresh = alerts.filter(alert => !keys.has(`${alert.userId}:${alert.link}`));
    if (fresh.length) await tx.notification.createMany({ data: fresh });
  }
  return !scope.reportId && rows.length > limit ? rows[limit - 1].id : null;
}
