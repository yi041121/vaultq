import { prisma } from "./prisma";
import { suggestMatches } from "./report-match";

/** Notify only about possible matches; never create or approve a claim here. */
export async function notifyInventoryMatches(scope: { itemId?: string; reportId?: string }) {
  if (!scope.itemId && !scope.reportId) return;
  try {
    const items = await prisma.item.findMany({
      where: { status: "FOUND", ...(scope.itemId ? { id: scope.itemId } : {}) },
      select: { id: true },
    });
    for (const { id } of items) {
      await prisma.$transaction(async (tx) => {
        // Serialize checks for the same item so retries cannot duplicate alerts.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`match-alert:${id}`}))`;
        const item = await tx.item.findUnique({
          where: { id },
          select: {
            id: true, itemName: true, category: true, description: true, foundLocation: true, foundDate: true, status: true,
            reports: { where: { type: "FOUND", status: "VERIFIED" }, select: { userId: true } },
            claims: { where: { status: { in: ["PENDING", "APPROVED"] } }, select: { userId: true } },
          },
        });
        if (!item || item.status !== "FOUND") return;
        const excludedUsers = [...item.reports, ...item.claims].map((entry) => entry.userId);
        const reports = await tx.report.findMany({
          where: {
            type: "LOST", status: "PENDING",
            ...(scope.reportId ? { id: scope.reportId } : {}),
            userId: { notIn: excludedUsers },
          },
          select: { id: true, userId: true, itemName: true, category: true, description: true, location: true, date: true },
        });
        const candidate = { ...item, foundDate: item.foundDate?.toISOString() || null };
        const alerts = reports.flatMap((report) => {
          const suggestions = suggestMatches({ ...report, date: report.date?.toISOString() || null }, [candidate]);
          if (!suggestions.length) return [];
          return [{
            userId: report.userId,
            title: "Possible Match Found",
            message: `An inventory item (${item.itemName}) may match your lost report for ${report.itemName}. Review the item and submit a claim if it is yours. This is not an ownership confirmation.`,
            type: "REPORT" as const,
            link: `/dashboard/student/search?item=${encodeURIComponent(id)}&report=${encodeURIComponent(report.id)}`,
          }];
        });
        if (!alerts.length) return;
        const existing = await tx.notification.findMany({
          where: { link: { in: alerts.map((alert) => alert.link) } },
          select: { userId: true, link: true },
        });
        const keys = new Set(existing.map((alert) => `${alert.userId}:${alert.link}`));
        const fresh = alerts.filter((alert) => !keys.has(`${alert.userId}:${alert.link}`));
        if (fresh.length) await tx.notification.createMany({ data: fresh });
      });
    }
  } catch {
    // Inventory/report writes already succeeded. Do not expose private report details.
    console.error("Could not send inventory match notifications");
  }
}
