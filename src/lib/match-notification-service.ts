import { enqueueJob, type OutboxDb } from "./notification-outbox";

/** Queue alongside the inventory/report write, never after committing it. */
export async function notifyInventoryMatches(scope: { itemId?: string; reportId?: string }, db: OutboxDb) {
  if (scope.itemId) return enqueueJob(db, "MATCH_ITEM", { itemId: scope.itemId, ...(scope.reportId ? { reportId: scope.reportId } : {}) });
  if (scope.reportId) return enqueueJob(db, "MATCH_REPORT", { reportId: scope.reportId });
}
