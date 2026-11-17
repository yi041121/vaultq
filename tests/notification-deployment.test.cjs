/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { migrationUrl, assertPendingMigrations, run } = require("../scripts/deploy-notification-migration.cjs");
const base = ["20260721022019_init", "20261114000000_auth_sessions_and_rate_limits"];
const outbox = "20261116000000_notification_outbox";
const passwordReset = "20261117000000_password_reset_tokens";
const applied = names => names.map(migration_name => ({ migration_name, finished_at: new Date(), rolled_back_at: null }));

test("production migration guard accepts only reviewed pending migrations", () => {
  assert.deepEqual(assertPendingMigrations([...base, outbox], applied(base)), [outbox]);
  assert.deepEqual(assertPendingMigrations([...base, outbox, passwordReset], applied(base)), [outbox, passwordReset]);
  assert.deepEqual(assertPendingMigrations([...base, outbox, passwordReset], applied([...base, outbox])), [passwordReset]);
  assert.deepEqual(assertPendingMigrations([...base, outbox, passwordReset], applied([...base, outbox, passwordReset])), []);
  assert.throws(() => assertPendingMigrations([...base, outbox, passwordReset, "unrelated"], applied(base)), /Unrelated pending/);
});

test("production migration guard rejects missing history and unfinished migrations without resetting anything", () => {
  assert.throws(() => assertPendingMigrations([...base, outbox, passwordReset], []), /history missing/);
  assert.throws(() => assertPendingMigrations([...base, outbox, passwordReset], [...applied(base), { migration_name: outbox, finished_at: null, rolled_back_at: null }]), /unfinished migration/);
});

test("migration connection selects the explicit direct URL or derives only a Neon direct endpoint", () => {
  assert.equal(new URL(migrationUrl({ DATABASE_URL: "postgresql://u:p@ep-demo-pooler.us-east-1.aws.neon.tech/db?sslmode=require" })).hostname, "ep-demo.us-east-1.aws.neon.tech");
  assert.equal(new URL(migrationUrl({ DATABASE_URL: "postgresql://u:p@pooler.example/db", DATABASE_URL_UNPOOLED: "postgresql://u:p@direct.example/db" })).hostname, "direct.example");
  assert.throws(() => migrationUrl({ DATABASE_URL: "postgresql://u:p@custom-pooler.example/db" }), /UNPOOLED/);
  assert.throws(() => migrationUrl({ DATABASE_URL: "https://example.test" }), /Postgres/);
});

test("non-production builds never attempt an automatic database migration", async () => {
  await run({ VERCEL_ENV: "preview" });
  await run({});
});

test("Hobby cron is daily and production build validates migrations before compiling", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../vercel.json"), "utf8"));
  assert.match(config.buildCommand, /^node scripts\/deploy-notification-migration\.cjs && npm run build$/);
  assert.deepEqual(config.crons, [{ path: "/api/internal/notifications/drain", schedule: "0 0 * * *" }]);
  const route = fs.readFileSync(path.join(__dirname, "../src/app/api/notifications/route.ts"), "utf8");
  assert.ok(route.indexOf("if (!user)") < route.indexOf("await flushNotifications"));
  assert.match(route, /flushNotifications\(\{ limit: 2, budgetMs: 500 \}\)/);
});
