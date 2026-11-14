# Security hardening follow-up

Email-ownership verification is intentionally deferred at the user's request.
No production migrations are part of this batch. Hardware enrolment now uses
the `HARDWARE_DEVICES` deployment secret described in `docs/pickup-security.md`.

## Completed in the server-side batch

- Next.js 16.4.6 and compatible Prisma 7.10.1 packages; code-generation tooling
  (`shadcn`) is a development dependency, not a runtime dependency.
- Admin-only locker reads; students cannot select historical inventory via a
  crafted status filter or read unrelated unavailable item details.
- Item-first locks for manual locker assignment/release; contradictory locker
  status changes and moving approved inventory through manual controls fail.
- Conditional, revision-checked found-report verification and atomic locker
  reservation prevent duplicate inventory and stale review writes.
- Rejected claims support the same explicit 80-character no-photo exception.
- Report cursor pagination is followed by student/admin list loaders, including
  prefetch and pending-report selection. Failed later pages are not cached as a
  complete successful result.
- Shared Postgres-backed per-account throttles run before student upload parsing
  and inventory suggestion scans. Existing auth throttles are unchanged.
- Numeric item names/locations are allowed; impossible calendar dates fail.
- Locker UI no longer substitutes demo data or pretends offline writes succeeded.
- Browser/API authentication is cookie-only. Login/session JSON contains public
  session identity/expiry metadata, not JWTs. Legacy localStorage tokens are
  purged; API mutations enforce same-origin checks and stale-tab identity guards.
- Hardware uses per-device API keys and server-owned device/locker mappings.
  The previous global key/implicit locker fallback is removed.

## Remaining work requiring coordination

### Physical pickup acknowledgement

The current hardware endpoint still completes database collection before the
device receives the unlock instruction. A lost response or jam therefore needs
staff recovery. No firmware is present in this repository; changing only the
server would break the existing device contract.

Next implementation must coordinate server and firmware:

1. Persist an idempotent pickup attempt, bound to an enrolled device and locker.
2. Keep inventory/locker reserved while issuing the unlock command.
3. Authenticate an acknowledgement of physical completion, not merely HTTP
   receipt, before consuming collection and freeing the locker.
4. Keep ambiguous/failed attempts reserved for explicit staff recovery; do not
   assume success after a timeout or blindly reissue an unlock.
5. Test network loss, device restart, jams, duplicate acknowledgement and replay.

Device identities are already configured in the server registry. Physical
acknowledgement and idempotent command recovery still require the firmware.

### Durable notification outbox

Notification errors are still best-effort and swallowed after workflow commits.
Matching also still runs in the request. A reliable replacement needs an outbox
written in the same transaction as each workflow event, stable deduplication
keys, retry scheduling and an authenticated worker. A transient delivery failure
must not either lose the event or rerun the original approval/report submission.

Prepare an additive migration and test it on an isolated database branch before
production. Do not reset production to repair the pre-existing migration drift.
Choose/configure the scheduler or queue before claiming retries are operational.

### XSS defence beyond credential storage

JWTs are no longer available to JavaScript. An XSS vulnerability could still
perform actions using the victim's active cookies; cookie-only authentication
does not make the application XSS-proof. Continue validating input, avoiding
unsafe HTML, reviewing dependencies and hardening security headers.

### Development tooling advisories

Re-run both `npm audit --omit=dev` and `npm audit` before release. Production
dependency audit is clean at this batch's verification; development tooling
still has advisories. Do not use `npm audit fix --force` to silently downgrade
or break the component tooling.

## Verification limits

Regression tests use doubles for database concurrency and devices. They do not
prove live Postgres locking behavior, production OAuth, real locker operation,
or phone layout correctness. Validate those separately before release.
