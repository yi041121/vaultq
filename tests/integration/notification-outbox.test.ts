import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";

const connection = process.env.NOTIFICATION_INTEGRATION_DATABASE_URL;
let prisma: PrismaClient;
let queue: typeof import("../../src/lib/notification-outbox");
let notify: typeof import("../../src/lib/notification-service");
let matches: typeof import("../../src/lib/match-notification-service");
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !connection }, fn);

before(async () => {
  if (!connection) return;
  const url = new URL(connection);
  // This suite deliberately deletes test fixtures. Never accept remote URLs.
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/vaultq_notification_test") throw new Error("Disposable local test database required");
  process.env.DATABASE_URL = connection;
  ({ prisma } = await import("../../src/lib/prisma"));
  queue = await import("../../src/lib/notification-outbox");
  notify = await import("../../src/lib/notification-service");
  matches = await import("../../src/lib/match-notification-service");
});
beforeEach(async () => {
  if (!connection) return;
  await prisma.$executeRawUnsafe('ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "test_delivery_failure"');
  await prisma.$executeRawUnsafe('ALTER TABLE "notification_jobs" DROP CONSTRAINT IF EXISTS "test_completion_failure"');
  await prisma.$executeRawUnsafe('ALTER TABLE "notification_jobs" DROP CONSTRAINT IF EXISTS "test_enqueue_failure"');
  await prisma.notificationJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.item.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.createMany({ data: [
    { id: "student", name: "Student", email: "student@example.test", password: "not-a-real-password", role: "STUDENT" },
    { id: "admin", name: "Admin", email: "admin@example.test", password: "not-a-real-password", role: "ADMIN" },
  ] });
});
after(async () => { if (prisma) await prisma.$disconnect(); });

integration("business write and notification event roll back together", async () => {
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: "student" }, data: { name: "Changed" } });
    await notify.notifyUser("student", "Test", "Test", {}, tx);
    throw new Error("abort workflow");
  }));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: "student" } })).name, "Student");
  assert.equal(await prisma.notificationJob.count(), 0);
});

integration("a failed batch enqueue rolls back both the business write and earlier batch entries", async () => {
  await prisma.$executeRawUnsafe('ALTER TABLE "notification_jobs" ADD CONSTRAINT "test_enqueue_failure" CHECK (payload->>\'title\' <> \'blocked\')');
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: "student" }, data: { name: "Changed" } });
    await notify.notifyUsers([{ userId: "student", title: "allowed", message: "Test" }, { userId: "admin", title: "blocked", message: "Test" }], tx);
  }));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: "student" } })).name, "Student");
  assert.equal(await prisma.notificationJob.count(), 0);
});

integration("transient delivery failure persists backoff and does not block another recipient", async () => {
  await prisma.$executeRawUnsafe('ALTER TABLE "notifications" ADD CONSTRAINT "test_delivery_failure" CHECK (title <> \'blocked\')');
  await prisma.$transaction(async tx => {
    await notify.notifyUsers([{ userId: "student", title: "blocked", message: "Retry me" }, { userId: "admin", title: "healthy", message: "Deliver now" }], tx);
  });
  const result = await queue.drainNotificationOutbox();
  assert.equal(result.retried, 1);
  assert.equal(result.completed, 1);
  const pending = await prisma.notificationJob.findFirstOrThrow({ where: { completedAt: null } });
  assert.equal(pending.attempts, 1);
  assert.ok(pending.availableAt.getTime() > Date.now());
  assert.equal(pending.lastError, "DELIVERY_FAILED");
  assert.equal(await prisma.notification.count(), 1);
  await prisma.$executeRawUnsafe('ALTER TABLE "notifications" DROP CONSTRAINT "test_delivery_failure"');
  await prisma.notificationJob.update({ where: { id: pending.id }, data: { availableAt: new Date(0) } });
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 2);
});

integration("notification insertion rolls back when completing its job fails", async () => {
  await notify.notifyUser("student", "atomic", "No duplicate on retry", {}, prisma);
  await prisma.$executeRawUnsafe('ALTER TABLE "notification_jobs" ADD CONSTRAINT "test_completion_failure" CHECK (completed_at IS NULL)');
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 0);
  assert.equal((await prisma.notificationJob.findFirstOrThrow()).attempts, 1);
  await prisma.$executeRawUnsafe('ALTER TABLE "notification_jobs" DROP CONSTRAINT "test_completion_failure"');
  await prisma.notificationJob.updateMany({ data: { availableAt: new Date(0) } });
  await queue.drainNotificationOutbox();
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 1);
});

integration("two concurrent workers deliver each queued message once", async () => {
  await prisma.$transaction(async tx => {
    for (let i = 0; i < 20; i++) await notify.notifyUser("student", `Message ${i}`, "Test", {}, tx);
  });
  await Promise.all([queue.drainNotificationOutbox(), queue.drainNotificationOutbox()]);
  assert.equal(await prisma.notification.count(), 20);
  assert.equal(await prisma.notificationJob.count({ where: { completedAt: { not: null } } }), 20);
});

integration("a fresh worker process recovers persisted events", async () => {
  await notify.notifyUser("student", "restart", "Survives process replacement", {}, prisma);
  const child = spawnSync(process.execPath, [...process.execArgv, path.join(process.cwd(), "tests/integration/drain-notifications.ts")], {
    env: { ...process.env, NOTIFICATION_INTEGRATION_DATABASE_URL: connection }, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(await prisma.notification.count({ where: { title: "restart" } }), 1);
});

integration("completed dedupe keys never create a second notification", async () => {
  const payload = { userId: "student", title: "deduped", message: "Test", type: "REPORT" };
  await queue.enqueueJob(prisma, "MESSAGE", payload, "stable-event");
  await queue.drainNotificationOutbox();
  await queue.enqueueJob(prisma, "MESSAGE", payload, "stable-event");
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 1);
  assert.equal(await prisma.notificationJob.count(), 1);
});

integration("poisoned jobs stop automatic retries after the bounded attempt limit", async () => {
  const job = await queue.enqueueJob(prisma, "UNKNOWN_KIND", {});
  await prisma.notificationJob.update({ where: { id: job.id }, data: { attempts: queue.MAX_NOTIFICATION_ATTEMPTS - 1 } });
  assert.equal((await queue.drainNotificationOutbox()).failed, 1);
  const failed = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.ok(failed.failedAt);
  assert.equal(failed.attempts, queue.MAX_NOTIFICATION_ATTEMPTS);
  assert.equal((await queue.drainNotificationOutbox()).failed, 0);
});

integration("deleted recipients retire safely without creating orphan notifications", async () => {
  await notify.notifyUser("student", "removed account", "Test", {}, prisma);
  await prisma.user.delete({ where: { id: "student" } });
  assert.equal((await queue.drainNotificationOutbox()).completed, 1);
  assert.equal(await prisma.notification.count(), 0);
});

async function matchingFixture() {
  await prisma.report.create({ data: { id: "lost", userId: "student", type: "LOST", itemName: "Water bottle", description: "Water bottle with a sticker", category: "Water Bottles", location: "Library" } });
  await prisma.item.createMany({ data: [
    { id: "blue", itemName: "Blue water bottle", description: "Water bottle with a sticker", category: "Water Bottles", foundLocation: "Library", adminId: "admin" },
    { id: "red", itemName: "Red water bottle", description: "Water bottle with a sticker", category: "Water Bottles", foundLocation: "Library", adminId: "admin" },
  ] });
}

integration("one failed inventory item cannot prevent alerts for another item", async () => {
  await matchingFixture();
  await prisma.$executeRawUnsafe('ALTER TABLE "notifications" ADD CONSTRAINT "test_delivery_failure" CHECK (message NOT LIKE \'%(Blue water bottle)%\')');
  await prisma.$transaction(async tx => {
    await matches.notifyInventoryMatches({ itemId: "blue" }, tx);
    await matches.notifyInventoryMatches({ itemId: "red" }, tx);
  });
  const result = await queue.drainNotificationOutbox();
  assert.equal(result.retried, 1);
  assert.equal(result.completed, 1);
  assert.equal(await prisma.notification.count(), 1);
  await prisma.$executeRawUnsafe('ALTER TABLE "notifications" DROP CONSTRAINT "test_delivery_failure"');
  await prisma.notificationJob.updateMany({ where: { completedAt: null }, data: { availableAt: new Date(0) } });
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 2);
});

integration("concurrent duplicate matching jobs dedupe by report/item under the item lock", async () => {
  await matchingFixture();
  await matches.notifyInventoryMatches({ itemId: "blue" }, prisma);
  await matches.notifyInventoryMatches({ itemId: "blue" }, prisma);
  await Promise.all([queue.drainNotificationOutbox(), queue.drainNotificationOutbox()]);
  assert.equal(await prisma.notification.count(), 1);
});

integration("stale matches recheck item/report availability before alerting", async () => {
  await matchingFixture();
  await matches.notifyInventoryMatches({ itemId: "blue" }, prisma);
  await prisma.item.update({ where: { id: "blue" }, data: { status: "CLAIMED" } });
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 0);
  await matches.notifyInventoryMatches({ reportId: "lost" }, prisma);
  await prisma.report.update({ where: { id: "lost" }, data: { status: "CLOSED" } });
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 0);
});

integration("item matching advances through bounded report pages without dropping older reports", async () => {
  await matchingFixture();
  await prisma.report.deleteMany();
  await prisma.report.createMany({ data: Array.from({ length: 101 }, (_, i) => ({
    id: `report-${String(i).padStart(3, "0")}`, userId: "student", type: "LOST" as const,
    itemName: "Water bottle", description: "Water bottle with a sticker", category: "Water Bottles", location: "Library",
  })) });
  await matches.notifyInventoryMatches({ itemId: "blue" }, prisma);
  const first = await queue.drainNotificationOutbox({ limit: 1 });
  assert.equal(first.continued, 1);
  assert.equal(await prisma.notification.count(), 100);
  await prisma.notificationJob.updateMany({ where: { completedAt: null }, data: { availableAt: new Date(0) } });
  await queue.drainNotificationOutbox();
  assert.equal(await prisma.notification.count(), 101);
});

integration("report matching fans out durable per-item jobs in bounded resumable pages", async () => {
  await matchingFixture();
  await prisma.item.deleteMany();
  await prisma.item.createMany({ data: Array.from({ length: 101 }, (_, i) => ({
    id: `item-${String(i).padStart(3, "0")}`, itemName: "Water bottle", adminId: "admin",
  })) });
  await matches.notifyInventoryMatches({ reportId: "lost" }, prisma);
  assert.equal((await queue.drainNotificationOutbox({ limit: 1 })).continued, 1);
  assert.equal(await prisma.notificationJob.count({ where: { kind: "MATCH_ITEM" } }), 100);
  await prisma.notificationJob.updateMany({ where: { kind: "MATCH_REPORT" }, data: { availableAt: new Date(0) } });
  await queue.drainNotificationOutbox({ limit: 1 });
  assert.equal(await prisma.notificationJob.count({ where: { kind: "MATCH_ITEM" } }), 101);
  assert.equal(await prisma.notificationJob.count({ where: { kind: "MATCH_REPORT", completedAt: { not: null } } }), 1);
});
