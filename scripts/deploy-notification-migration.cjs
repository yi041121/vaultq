/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS deployment script. */
// Run by Vercel's production build before the new application can go live.
// Never reset/baseline an existing database or apply unrelated pending changes.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");

const reviewedMigrations = new Set([
  "20261116000000_notification_outbox",
  "20261117000000_password_reset_tokens",
]);
const root = path.join(__dirname, "..");

function migrationUrl(env) {
  const url = new URL(env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Postgres deployment connection required");
  // Neon PgBouncer URLs must not be used for Prisma migration advisory locks.
  // Derive the direct endpoint only for Neon's documented pooler hostname.
  if (url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  else if (url.hostname.includes("-pooler")) throw new Error("Configure DATABASE_URL_UNPOOLED for migrations");
  return url.toString();
}

function assertPendingMigrations(known, history) {
  if (history.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error("An unfinished migration requires manual review");
  const applied = new Set(history.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name));
  // This deployment targets an existing VaultQ database, not a fresh install.
  if (!applied.has("20260721022019_init") || !applied.has("20261114000000_auth_sessions_and_rate_limits")) {
    throw new Error("Expected VaultQ migration history missing; refusing automatic deployment migration");
  }
  const pending = known.filter(name => !applied.has(name));
  if (pending.some(name => !reviewedMigrations.has(name))) throw new Error("Unrelated pending migrations require manual review");
  return pending;
}

async function run(env = process.env) {
  if (env.VERCEL_ENV !== "production") {
    console.log("Production database migration skipped outside production deployment");
    return;
  }
  const connectionString = migrationUrl(env);
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, application_name: "vaultq_notification_migration" });
  try {
    await client.connect();
    const history = await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"');
    const known = fs.readdirSync(path.join(root, "prisma/migrations"), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    const pending = assertPendingMigrations(known, history.rows);
    if (pending.length) {
      console.log("Applying reviewed additive database migrations");
      const output = execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
        cwd: root, env: { ...env, DATABASE_URL: connectionString }, encoding: "utf8", timeout: 120_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      console.log(output.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
    }
    // Validate the required columns, not just that similarly named tables exist.
    await client.query('SELECT id, dedupe_key, kind, payload, attempts, available_at, completed_at, failed_at, last_error, created_at FROM "notification_jobs" LIMIT 0');
    await client.query('SELECT id, user_id, token_hash, expires_at, used_at, created_at FROM "password_reset_tokens" LIMIT 0');
    console.log("Notification-outbox and password-reset schemas verified; application build may proceed");
  } finally { await client.end(); }
}

module.exports = { migrationUrl, assertPendingMigrations, run };
if (require.main === module) {
  run().catch(() => {
    // Do not print raw driver errors, CLI buffers or connection strings.
    console.error("Production database migration failed. Deployment stopped; existing production remains live. Review migration history and connectivity without resetting the database.");
    process.exitCode = 1;
  });
}
