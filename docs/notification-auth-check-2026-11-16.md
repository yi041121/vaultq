# Notification reliability and login workflow checks — 16 November 2026

> Follow-up: the outbox and worker are now implemented locally. See
> [notification-outbox.md](notification-outbox.md) for tests and required rollout
> steps. The findings below describe the pre-fix behavior, not the new worker.

This is a targeted check, not a notification-outbox deployment or a complete
authenticated end-to-end test. Earlier local review fixes remain uncommitted.
No production records/configuration were changed, and no migrations were run.

## 1. Notification loss reproduced

Ran the real notification services with injected database failures, without
connecting to a real database:

| Probe | Result |
| --- | --- |
| `notifyUser`: first write fails transiently | Returns normally; 1 attempt, 0 notifications stored |
| `notifyUsers`: first batch write fails transiently | Returns normally; 1 attempt, 0 notifications stored |
| Inventory match: first item transaction fails | Remaining items are not processed (1 of 2 visited) |

Relevant files: `src/lib/notification-service.ts`,
`src/lib/match-notification-service.ts`, and the direct notification write in
`src/app/api/claims/route.ts`. Most callers commit the business action before
attempting notification delivery. Neither an in-memory retry nor repeating the
HTTP request can close the server-crash gap reliably.

**Persistent retries are not implemented yet.** The repository has no outbox
model/worker, and `vercel.json` has no cron configuration.

### Required implementation

1. Add an outbox event in the **same database transaction** as the report,
   inventory or claim change. Include an event type, stable unique event key,
   payload, attempt count, next-attempt time and last safe error code.
2. Have a protected scheduled worker claim due events safely across instances.
   Use persisted leases or row locks, bounded batches and bounded transaction
   duration. Do not rely on process-local timers on Vercel.
3. Write the in-app notification and mark the event delivered atomically;
   retry with exponential backoff. Preserve report/item matching deduplication.
4. Retry matching from a durable matching event as well as direct messages.
   Saving only already-generated messages does not recover a failed match scan.
5. Monitor delayed/dead-letter events and provide safe administrative replay.
6. Test transient outages, process restart, concurrent workers, duplicate events,
   stale matching events and replay on an isolated database before rollout.

Prepare an additive migration and a scheduler configuration compatible with the
deployment plan. Reconcile existing migration drift separately; never reset
production. Do not mark this resolved until the migration and recurring worker
are actually deployed and verified.

## 2. Actual browser checks

Used headless Chromium against a local production build at these viewports:

- Desktop: 1440 × 900.
- Touch/mobile emulation: 390 × 844 and 320 × 568.

The local server used an unreachable local test database URL, not the project's
real database. Mutable browser API calls were intercepted. This deliberately
does not simulate a successful authenticated server session.

**Result: 22/25 probes passed.** The three failures are the same real defect at
the three viewport sizes:

> The login page's “Forgot password?” link points to `/forgot-password`, which
> returns HTTP 404. There is no password-reset page/API in the inspected source.

Choose between a real secure password-reset flow and honest admin-assisted
recovery instructions. Do not display a fake successful reset or create an
unprotected password-change endpoint. No change was made to this behavior in
this checking pass.

Passing probes covered login/registration form rendering without horizontal
overflow, native required/email validation before submission, a visible rejected
login error and re-enabled button (stubbed API), Google button navigation to the
OAuth-start endpoint (intercepted), real local callback cancellation handling,
anonymous dashboard redirects, and no uncaught page JavaScript errors.

Additional source observations: “Remember me” has no state or submission wiring;
session-cookie lifetime is fixed server-side. Password visibility buttons on the
login page have no accessible name. These need follow-up; they were not counted
as passing browser functionality.

Artifacts and the browser/failure-injection scripts are in
`/tmp/opencode/vaultq-workflow-review/`. Playwright was installed there, not in
the application package manifest or lockfile. Chromium mobile emulation is not
proof of real iOS Safari, virtual-keyboard or camera behavior.

## 3. Google OAuth handler checks

Added `tests/google-workflow-regression.test.cjs` with **10 passing tests** that
execute the actual handlers with real Next.js request/response/cookie objects,
but mocked Google responses, account lookup, session creation and rate limiting:

- OAuth entry callback URI/account-picker configuration and Secure/HttpOnly/
  SameSite state cookies.
- Missing/mismatched state rejected before provider or database access.
- Unverified Google email rejected.
- Disabled accounts rejected.
- Signup intent does not silently log an existing account in.
- New campus identities return to signup without creating a session/account.
- New non-campus identities rejected.
- Token, profile, network and database failures produce safe errors.
- Throttling prevents exchange and clears transient cookies.
- Successful callback normalizes email, sets a Secure/HttpOnly session cookie,
  clears OAuth cookies and keeps credentials out of the redirect URL.

All **271** unit/regression tests pass. The new test file passes ESLint.

### Still requires an isolated environment and interactive access

Real Google consent, provider-approved production redirect URIs, token exchange,
real account/session creation, login/logout/account switching, authenticated
student/admin workflows, camera permissions/photos, real phones and database
concurrency are **not verified** by the above tests. These require a staging/test
database, disposable student/admin accounts and an interactive Google account.
Do not send passwords, Google tokens or client secrets in chat.
