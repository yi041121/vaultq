import { enqueueNotification, type NotificationMessage, type OutboxDb } from "./notification-outbox";
import type { NotificationType } from "@/generated/prisma/enums";
export { flushNotifications } from "./notification-outbox";

interface NotifyOptions { type?: NotificationType; link?: string | null }

/** Passing the workflow transaction is mandatory at business-write call sites.
 * Queue failures propagate so the business write rolls back rather than losing
 * its notification. Delivery failures are retried independently by the worker. */
export async function notifyUser(userId: string, title: string, message: string, options: NotifyOptions, db: OutboxDb) {
  await enqueueNotification(db, { userId, title, message, ...options });
}

export async function notifyUsers(entries: NotificationMessage[], db: OutboxDb) {
  for (const entry of entries) await enqueueNotification(db, entry);
}
