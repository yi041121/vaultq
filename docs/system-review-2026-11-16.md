# VaultQ system review — 16 November 2026

> Follow-up: durable notification handling is now implemented and tested locally;
> see [notification-outbox.md](notification-outbox.md). Its deployment still
> requires the additive migration, scheduler configuration and staging checks.

## Outcome and scope

Reviewed authentication/session/CSRF controls, account/profile writes, report
submission/review, matching and notifications, claim approval/cancellation/
resubmission, pickup/locker services, image handling, student search/linking,
database schema/migration files, dependencies, and existing regression coverage.
This is a source review plus automated checks, not proof that every workflow is
bug-free. No production records, configuration, dependencies or migrations were
changed. No commit or deployment was made.

## Bugs fixed locally

1. **Lost-report edits and reopens missed existing inventory matches.**
   `src/app/api/reports/[id]/route.ts` now invokes the existing deduplicated
   matcher after a successful student edit or admin reopen of a lost report.
   Found reports and rejected writes do not schedule alerts.
2. **A temporary report fetch failure silently bypassed claim linking.**
   `src/app/dashboard/student/search/page.tsx` previously returned an empty list
   and marked it loaded even after a failed request. It now distinguishes failure
   from a successful empty list, shows an error instead of starting an unlinked
   claim, and allows retry. Notification deep links handle the same failure.
3. **First-time profile barcode assignment could overwrite a concurrent value.**
   `src/app/api/user/profile/route.ts` now conditions the write on the barcode
   snapshot used during authorization. A competing tab/admin assignment produces
   a conflict rather than replacing the barcode. Database uniqueness conflicts
   for barcode/student ID also return 409 instead of a generic 500.
4. **Invalid report/profile request bodies produced server errors.**
   Those two PATCH handlers now reject malformed JSON, null, arrays and primitives
   with a 400 response before accessing their fields.

Eight regression tests were added in `tests/system-review-regression.test.cjs`.
They execute handlers/the report loader with doubles; they do not prove real
Postgres concurrency.

## Highest-priority remaining work

### P1 — Physical pickup acknowledgement and recovery

`src/lib/pickup-service.ts` consumes the QR, marks inventory retrieved and frees
the locker before the hardware receives its unlock instruction. Lost responses,
power loss or a jam can leave database state ahead of physical reality. Keep
hardware pickup disabled until device enrollment is configured and the coordinated
acknowledgement/idempotent-command design in `docs/security-hardening-follow-up.md`
is implemented and physically tested. Do not fix this only on the server while
leaving firmware on the previous protocol.

### P1 — Reliable notification delivery

`src/lib/notification-service.ts` swallows delivery failures; inventory matching
is best-effort and runs inside HTTP requests. A committed report/item/review can
therefore have no notification, with no scheduled retry. Add a transactional
outbox, stable event IDs, a retry worker, monitoring and a dead-letter/replay path.
Preserve the distinction between a possible match and ownership approval.

### P1 — Real workflow and concurrent database tests

The current suite includes source assertions and transaction/network doubles.
Add browser tests for both roles: login/logout and account switching, reports,
related-only linking, photo/no-photo claims, crop/revert and denied camera access,
admin verification, reject/resubmit/cancel, QR expiry/replay, and nested dialogs.
On an isolated database, race approval against cancellation/resubmission,
duplicate submission and locker allocation. Test OAuth with a real callback.
Do not run these mutating tests against production.

### P1 — Identity ownership risk intentionally deferred

Password registration still intentionally skips email-ownership verification.
A student-domain suffix is not proof of account ownership. Keep this documented
as an accepted risk; use staff identity checks for sensitive pickup decisions.
Revisit verification before broader deployment if the requirement changes.

### P2 — Quality gates and development dependencies

The full lint command fails: **81 errors and 57 warnings** at baseline, primarily
explicit `any`, React effect/state patterns and hook dependencies. Fix these in
small batches rather than disabling rules. No `.github/workflows` CI files were
found. Add CI gates for tests, type checking, production build, lint and runtime
dependency audit.

Runtime audit: **0 reported vulnerabilities**. Full dependency audit:
**13 advisories (1 high, 10 moderate, 2 low)** in development tooling/transitive
dependencies. Review compatible upgrades; do not use `npm audit fix --force` to
silently downgrade component tooling. Audit results are time-dependent.

### P2 — List sizes, matching cost and images

`src/app/api/claims/route.ts` returns the entire claim collection, including image
sources by default; search and prefetch request this non-light endpoint. Item
lists are also unpaginated. Move to bounded server pagination and lightweight
responses, loading evidence/detail only when needed. Update all callers together
so older records are not silently hidden. Match notifications scan candidate
reports/items synchronously; move that work to the durable worker as data grows.
Consider dedicated file storage rather than base64 photos in database rows.

### P2 — Database deployment reproducibility and indexing

Source schema and checked-in migration history have pre-existing drift; declared
report/notification indexes and later columns are not all represented in the
checked-in migrations inspected here. Their live presence was **not verified**.
Reconcile on an isolated branch and rehearse installation/restore from scratch.
Never reset production to repair history. Review claim lookups by user/item/
status and report-link pointers with real query plans before adding indexes or
constraints. Rehearse backup restoration, not just backup creation.

### P2 — Consolidate legacy matching behavior

The report PATCH `action: "match"` creates a `MATCHED` report notice without a
claim, while `/api/claims/match` immediately creates an approved claim. The
student report card sends `MATCHED` reports to My Claims, and student claim
linking only accepts `PENDING` reports. The current UI uses the latter admin
matching endpoint; the legacy path can still produce confusing records if used.
Choose one supported contract, then migrate legacy rows/clients deliberately
instead of silently changing admin approval semantics.

## Verification performed

- `node --test tests/*.test.cjs`: **261 passed, 0 failed**.
- `npx tsc --noEmit`: passed after fixes.
- `npm run build`: passed after fixes.
- Changed-file lint: **0 errors, 3 existing warnings**.
- `npm audit --omit=dev`: **0 reported vulnerabilities**.
- Local production-server HTTP smoke: **19/19 passed**. Public pages returned
  200; protected student/admin pages redirected without a session; the selected
  item/claim/report/locker/account/notification/profile/admin APIs returned 401.
  This checks anonymous access only, not authenticated role transitions.
- Full-project lint remains failing as documented above.

## Not verified

No authenticated browser/mobile session, live database locking/query plans,
production migration state, real Google sign-in, real camera permissions,
physical locker, delivery recovery, load test or backup restoration was tested.
The local smoke server was stopped after the checks. Production deployment was
not changed.
