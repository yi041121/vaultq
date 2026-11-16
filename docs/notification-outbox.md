# Durable in-app notifications

## Implementation

New notifications and inventory-match checks are stored in `notification_jobs`
**inside the transaction that changes the report, item or claim**. Queue inserts
are not best-effort: if persistence fails, that workflow transaction rolls back.
This prevents a successful approval/submission with no recoverable notification
event. It cannot recover notifications already lost before this rollout.

After commit, handlers attempt a small drain for responsive delivery. Delivery
failure does not undo the committed business action; the job stays in Postgres.
The configured Hobby-plan scheduler runs daily at 00:00 UTC as an idle safety
net. Authenticated notification/bell checks also process up to two due jobs
within a small time budget, so active use advances retries more frequently.
There are no process-local timers or client-side retry jobs.

Each job is selected with `FOR UPDATE SKIP LOCKED`. Creating its notification and
marking it completed share a transaction. A crash rolls back both, permitting a
fresh worker to recover it. Concurrent workers cannot deliver the same message
job twice. Match alerts also retain the per-item advisory lock and report/item
deduplication, so separate matching events do not duplicate existing alerts.

- Failed delivery: exponential backoff starting at 30 seconds, capped at 1 hour.
- After 12 failed attempts: preserved as failed for administrator inspection.
- A failed job does not stop unrelated recipients/items.
- Large matching scans advance through 100-record pages. Lost-report checks
  expand to independent, durable per-item jobs; failure for one item cannot
  abandon the rest of the inventory.
- Worker rechecks report/item availability before sending match alerts.
- Deleted recipients are retired safely. Stored error codes do not contain SQL,
  connection strings, private descriptions or stack traces.
- Scheduling timestamps use the database clock, avoiding timezone/clock-skew
  errors that could make a retry immediately runnable.

This is for notifications displayed inside VaultQ, not email or SMS delivery.

## Deployment order — required before using the new code

1. Rehearse the additive migration on an isolated branch/database:
   `prisma/migrations/20261116000000_notification_outbox/migration.sql`.
   The migration was applied successfully to disposable local PostgreSQL 18.
   Production migration history has pre-existing drift: reconcile that history
   deliberately before applying migrations. **Do not reset production or use
   `prisma db push` as a shortcut.** Use a direct connection for migrations.
2. Vercel's production build now runs
   `scripts/deploy-notification-migration.cjs` before `npm run build`. It uses
   the deployed database secret, selects a direct Neon connection, verifies the
   existing migration history and refuses unrelated/unfinished migrations.
   Prisma applies only the reviewed pending outbox migration, then the script
   verifies the required table columns. A failed migration stops deployment;
   the existing production application remains live. The old app ignores the
   new table. Local/preview builds do not run this production migration step.
3. Configure a private, environment-specific **CRON_SECRET** with at least 32
   random characters. Never use a `NEXT_PUBLIC_` variable or put it in a URL.
4. `vercel.json` schedules `GET /api/internal/notifications/drain` daily using
   Vercel's `Authorization: Bearer <CRON_SECRET>` header. The endpoint rejects
   anonymous/wrong credentials, returns 503 if unconfigured/unavailable, and
   returns only counts.
5. Verify a real scheduled invocation, delayed retry and subsequent recovery on
   staging before calling persistent delivery operational in production.

### Scheduler choices

The project is on Vercel Hobby. The user selected **daily cron plus active-use
retries** to avoid a paid upgrade or external scheduler. When nobody uses the
app, retries may wait until the next daily run. Daily invocation timing is also
subject to Vercel's Hobby scheduling window; it is not a minute-level SLA.

For a Vercel plan supporting minute-level cron, merge this into `vercel.json`
(preserving existing fields), and configure Vercel's `CRON_SECRET`:

```json
{
  "crons": [
    { "path": "/api/internal/notifications/drain", "schedule": "* * * * *" }
  ]
}
```

Otherwise use a trusted external scheduler that sends the same Bearer header
every minute. Treat HTTP failures as scheduler failures and monitor the returned
`failed` count too; a 200 response alone does not mean every job was delivered.
Preview/staging deployments must use separate databases and secrets.

## Inspection and manual retry

Both endpoints require the existing persisted **ADMIN** session. The POST also
uses the existing same-origin and stale-session checks in `authenticateRequest`.

- `GET /api/admin/notification-jobs`: pending/failed counts, oldest pending time,
  and up to 50 failed job IDs/types/attempt counts. No message payloads returned.
- `POST /api/admin/notification-jobs`, JSON `{ "id": "failed-job-id" }`: resets
  a failed, incomplete event for the next worker run. It cannot replay a completed
  event. Investigate persistent errors before repeatedly retrying.

Monitor pending age and failed count. Queued jobs currently remain for audit;
define a retention policy before high-volume deployment. Do not remove incomplete
or failed jobs as a cleanup shortcut.

## Tests

Normal security/regression suite:

```bash
node --test tests/*.test.cjs
```

Actual PostgreSQL integration tests (explicit opt-in, disposable local database
only; the suite deletes its fixtures and rejects remote URLs):

```bash
NOTIFICATION_INTEGRATION_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/vaultq_notification_test \
  npx --yes --package=tsx tsx --test tests/integration/notification-outbox.test.ts
```

Initialize that database from the pre-outbox schema and then apply the new
migration. This separately tests the additive migration rather than merely
creating the final schema. Do not point it at an existing working database.

Verified: rollback of business writes/partial batch enqueue; transient failures
and future backoff; atomic delivery/completion; two concurrent workers; recovery
in a fresh process; stable event keys; bounded dead-letter handling; deleted
accounts; per-item failure isolation; concurrent match deduplication; stale
matches; and report/inventory pagination beyond 100 records.

Initial local results: **275 unit/regression tests and 14 real PostgreSQL
integration tests passed**; production build/TypeScript passed; the queue,
worker, transition services and new tests pass ESLint. Applying the additive
migration to the local pre-outbox schema produced an empty Prisma schema diff.

The production secret and cron configuration were authorized for rollout.
Before pushing, the build-time migration runner was also rehearsed against a
second disposable local database with the pre-outbox schema and existing Prisma
history; first execution applied the new migration and the second was a no-op.
Production migration/deployment results must still be verified after the push.
