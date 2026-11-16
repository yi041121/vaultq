// Separate process used to prove that queued work survives process exit.
async function main() {
  const url = new URL(process.env.NOTIFICATION_INTEGRATION_DATABASE_URL || "");
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/vaultq_notification_test") throw new Error("Disposable local test database required");
  process.env.DATABASE_URL = url.toString();
  const { prisma } = await import("../../src/lib/prisma");
  try {
    const { drainNotificationOutbox } = await import("../../src/lib/notification-outbox");
    console.log(JSON.stringify(await drainNotificationOutbox()));
  } finally { await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
