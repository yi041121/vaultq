import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { deliverInventoryMatchBatch } from "./inventory-match-delivery";

export type OutboxDb = Pick<Prisma.TransactionClient, "$queryRaw">;
export type NotificationMessage = { userId: string; title: string; message: string; type?: NotificationType; link?: string | null };
export const MAX_NOTIFICATION_ATTEMPTS = 12;
const PAGE_SIZE = 100;

export async function enqueueNotification(db: OutboxDb, message: NotificationMessage) {
  return enqueueJob(db, "MESSAGE", { ...message, type: message.type || "SYSTEM", link: message.link || null });
}

export async function enqueueJob(db: OutboxDb, kind: string, payload: Prisma.InputJsonObject, dedupeKey: string = randomUUID()) {
  // Upsert keeps a completed event completed when the same event is replayed.
  // Database-owned timestamps avoid application/driver timezone or clock skew
  // turning a future retry into an immediately runnable hot loop.
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "notification_jobs" (id, dedupe_key, kind, payload)
    VALUES (${randomUUID()}, ${dedupeKey}, ${kind}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
    RETURNING id
  `;
  if (rows.length !== 1) throw new Error("Notification event was not persisted");
  return rows[0];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid notification job");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Invalid notification job field");
  return value;
}
function optionalText(value: unknown): string | undefined { return value == null ? undefined : text(value); }

export function notificationRetryDelay(attempt: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 7));
}

async function deliver(tx: Prisma.TransactionClient, job: { id: string; kind: string; payload: unknown }): Promise<Prisma.InputJsonObject | null> {
  const payload = object(job.payload);
  if (job.kind === "MESSAGE") {
    const userId = text(payload.userId);
    const type = text(payload.type);
    if (!["CLAIM", "REPORT", "LOCKER", "SYSTEM"].includes(type)) throw new Error("Invalid notification type");
    // Account removal retires the message instead of retrying a broken FK forever.
    // createMany's FK still protects against deletion between this read/write.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (user) await tx.notification.create({ data: {
      userId, title: text(payload.title), message: text(payload.message), type: type as NotificationType,
      link: optionalText(payload.link) || null,
    } });
    return null;
  }
  if (job.kind === "MATCH_REPORT") {
    const reportId = text(payload.reportId);
    const report = await tx.report.findFirst({ where: { id: reportId, type: "LOST", status: "PENDING", itemId: null }, select: { id: true } });
    if (!report) return null;
    const cursor = optionalText(payload.cursor);
    const items = await tx.item.findMany({
      where: { status: "FOUND", ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: "asc" }, take: PAGE_SIZE + 1,
    });
    for (const item of items.slice(0, PAGE_SIZE)) {
      await enqueueJob(tx, "MATCH_ITEM", { itemId: item.id, reportId }, `${job.id}:item:${item.id}`);
    }
    return items.length > PAGE_SIZE ? { reportId, cursor: items[PAGE_SIZE - 1].id } : null;
  }
  if (job.kind === "MATCH_ITEM") {
    const scope = { itemId: text(payload.itemId), reportId: optionalText(payload.reportId), cursor: optionalText(payload.cursor) };
    const cursor = await deliverInventoryMatchBatch(tx, scope, PAGE_SIZE);
    return cursor ? { itemId: scope.itemId, ...(scope.reportId ? { reportId: scope.reportId } : {}), cursor } : null;
  }
  throw new Error("Unknown notification job kind");
}

/** Each local-DB delivery and completion commit together. No lease is needed:
 * row locks are released on crash and SKIP LOCKED lets other workers progress. */
export async function drainNotificationOutbox(options: { limit?: number; budgetMs?: number } = {}) {
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const deadline = Date.now() + Math.max(100, Math.min(20_000, options.budgetMs ?? 10_000));
  const result = { completed: 0, continued: 0, retried: 0, failed: 0 };
  for (let i = 0; i < limit && Date.now() < deadline; i++) {
    let selected: { id: string; attempts: number } | null = null;
    try {
      const outcome = await prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "notification_jobs"
          WHERE completed_at IS NULL AND failed_at IS NULL AND available_at <= clock_timestamp()
          ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
        `;
        if (!rows.length) return "empty";
        const job = await tx.notificationJob.findUniqueOrThrow({ where: { id: rows[0].id } });
        selected = { id: job.id, attempts: job.attempts };
        const next = await deliver(tx, job);
        if (next) await tx.$executeRaw`
          UPDATE "notification_jobs" SET payload = ${JSON.stringify(next)}::jsonb,
            attempts = 0, last_error = NULL, available_at = clock_timestamp() + INTERVAL '1 second'
          WHERE id = ${job.id}
        `;
        else await tx.$executeRaw`
          UPDATE "notification_jobs" SET completed_at = clock_timestamp(), last_error = NULL WHERE id = ${job.id}
        `;
        return next ? "continued" : "completed";
      }, { timeout: 8000, maxWait: 1000 });
      if (outcome === "empty") break;
      result[outcome]++;
    } catch {
      // The delivery transaction rolled back, including notification writes.
      // CAS avoids overwriting a completion/retry committed by another worker.
      const failed = selected as { id: string; attempts: number } | null;
      if (!failed) throw new Error("Notification queue unavailable");
      const attempts = failed.attempts + 1;
      const exhausted = attempts >= MAX_NOTIFICATION_ATTEMPTS;
      await prisma.$executeRaw`
        UPDATE "notification_jobs" SET attempts = ${attempts},
          available_at = clock_timestamp() + (${notificationRetryDelay(attempts)} * INTERVAL '1 millisecond'),
          failed_at = CASE WHEN ${exhausted} THEN clock_timestamp() ELSE NULL END,
          last_error = 'DELIVERY_FAILED'
        WHERE id = ${failed.id} AND attempts = ${failed.attempts} AND completed_at IS NULL AND failed_at IS NULL
      `;
      result[exhausted ? "failed" : "retried"]++;
      // Continue: a poisoned job must never prevent other recipients/items.
    }
  }
  return result;
}

/** Fast-path only. The authenticated scheduler remains necessary for retries. */
export async function flushNotifications() {
  try { await drainNotificationOutbox({ limit: 10, budgetMs: 2000 }); }
  catch { console.error("Notification worker unavailable; queued events remain pending"); }
}
