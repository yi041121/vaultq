# Authentication sessions and rate limiting rollout

Step 6 replaces browser-asserted roles with a persisted server session while
keeping the existing JWT, password, and Google identity model. This document
describes what must be configured and what is still deliberately unchanged.

## 1. Apply the migration first

The application now requires these tables:

- `auth_sessions` — one row per signed-in session, addressed by the JWT `jti`.
- `auth_rate_limit_buckets` — shared, atomic login/registration/lookup limits.

Apply:

```bash
npx prisma migrate deploy
```

Do **not** deploy the new code before the migration succeeds. Until the tables
exist, authentication fails closed:

- password and Google sign-in cannot create a session;
- login, registration, email/barcode lookup, Google start/callback, and
  barcode decoding return `503` from the rate limiter;
- existing sessions cannot be validated.

The new migration was applied successfully to a throwaway PostgreSQL 18
cluster during validation, including the atomic upsert and cleanup statements.
No migration has been applied to the project database.

### Migration-history caveat

The repository currently contains only the original `init` migration plus this
Step 6 migration, while several pre-existing schema changes were applied to the
database outside migration history. Running `prisma migrate deploy` on an
**empty** database therefore does not reproduce the full current Prisma schema.
For the existing database, apply only the new migration. Before any future
environment is created from scratch, generate a reviewed baseline that matches
the deployed schema. Do not use `migrate reset` or `db push --force-reset` on a
database that holds real records.

Check the recorded history before deploying:

```sql
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY started_at;
```

- If `20260721022019_init` is recorded as finished, `npx prisma migrate deploy`
  applies only the Step 6 migration.
- If `_prisma_migrations` is empty because the schema was created with
  `db push`, `migrate deploy` will try to run `init` and fail on existing
  tables. In that case, first acknowledge the existing baseline without
  re-running it:

  ```bash
  npx prisma migrate resolve --applied 20260721022019_init
  npx prisma migrate deploy
  ```

- If the Step 6 tables already exist from a manual run, mark that migration as
  applied instead of running it twice:

  ```bash
  npx prisma migrate resolve --applied 20261114000000_auth_sessions_and_rate_limits
  ```

Never run `prisma migrate dev` against production: its drift detection may
offer to reset the database.

## 2. Required secrets and HTTPS

- `JWT_SECRET` must be at least 32 characters, unique per environment, and
  must not be the old development fallback. Missing, short, padded, or known
  fallback values now throw instead of silently using a weak key. The old
  fallback is no longer accepted.
- `IMAGE_SIGNING_SECRET` is optional. If provided it must be at least 32
  characters. Otherwise image signatures use a key derived from `JWT_SECRET`
  with a separate domain label, so JWT and image signatures do not share the
  same raw key.
- Rotating `JWT_SECRET` invalidates every issued token. All users must sign in
  again. Rotating it also invalidates outstanding signed image URLs.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in
  production. Serve the app over HTTPS; plain HTTP will not receive the
  session cookie in production.

## 3. Trusted client identity

Rate limiting needs a trustworthy client IP:

- On Vercel, `VERCEL=1` is set automatically and `x-vercel-forwarded-for` is
  used because Vercel overwrites it at the edge.
- On another host behind a reverse proxy that overwrites `X-Forwarded-For`,
  set `AUTH_TRUST_PROXY=true`.
- Otherwise forwarding headers are ignored and all anonymous callers share
  one conservative per-IP bucket. This prevents header spoofing but may make
  limits coarser; configure the proxy flag only when the proxy is actually
  trusted.

Current limits:

| Action | Limit |
| --- | --- |
| Login per IP | 100 / 15 min |
| Login per account + IP | 10 / 15 min |
| Login per account | 30 / 15 min |
| Registration per IP | 20 / hour |
| Email/barcode lookup per IP | 60 / min |
| Google start/callback per IP | 30 / 5 min |
| Barcode image decode per IP | 10 / 5 min |

Limits use the database clock and one atomic upsert per bucket, so concurrent
serverless instances share the same counters. Stored keys are HMAC-SHA256
digests; raw email addresses and IPs are not stored in the limiter table. A
missing table, database failure, or invalid secret returns `503` with
`Retry-After` rather than allowing unlimited attempts. Expired rows are
deleted in bounded batches, not with an unbounded table scan on every request.

## 4. Forced re-login for legacy tokens

Tokens issued before this change have no `jti` and no matching
`auth_sessions` row. They are rejected even if their signature is still valid.
After deployment:

1. Users with an old token are sent to `/login?skip=1`.
2. The login page verifies server state instead of decoding browser storage.
3. Signing in creates a new persisted session and replaces the old token.
4. The browser's old `vq_role` hint is cleared or replaced.

This is intentional. It is the boundary between the old stateless token and
the new revocable session.

## 5. Where authorization is enforced

- **Proxy** (`src/proxy.ts`) verifies only the token signature and claims for
  an optimistic redirect. It performs no database query. A forged `vq_role`
  cookie grants nothing.
- **Server layouts / DAL** (`src/app/dashboard/*/layout.tsx`,
  `src/lib/dal.ts`) perform the authoritative check: the persisted session
  must exist, be unexpired, belong to the account, and the account must still
  be active with the claimed role.
- **API handlers** use `authenticateRequest`, which performs the same
  persisted-session check for the HttpOnly `vq_session` cookie. Bearer-only
  requests are rejected. Mutations must additionally pass the same-origin check.
- `vq_role` remains only as a display hint for legacy UI code. It is never
  used for authentication or authorization.

This split follows the Next.js guidance that Proxy should not fetch sessions
or perform slow database work, while the Data Access Layer is the secure
check close to the data.

## 6. Logout and session races

- Logout posts to `/api/auth/logout`, revokes the persisted session, and
  clears both `vq_session` and `vq_role`.
- A stale tab logging out with an old public session key receives `409` and
  cannot revoke or clear a newer browser session cookie.
- Client logout requests are queued so a sign-out cannot race a session
  restore. The shared shell waits for server revocation before clearing local
  state and navigating away.
- All cookie-authenticated mutations require an exact same-origin `Origin`, or an
  explicit `X-VaultQ-Request: 1` header with no cross-site/same-site fetch
  metadata. Cross-origin browser posts are rejected before the body, database,
  or rate limiter is touched.

## 7. Cookie-only browser/API authentication

- The HttpOnly `vq_session` cookie authenticates dashboard routes and APIs.
- Login and `GET /api/auth/session` return `user`, `sessionKey`, and `expiresAt`.
  The public session key is a cache/cross-tab identifier; it cannot authenticate
  without the signed HttpOnly cookie. JWTs are never included in those JSON
  responses, browser storage or redirect URLs.
- The legacy bearer-to-cookie session import endpoint is removed.
- Browser clients send `X-VaultQ-Session` as a stale-session guard and
  `X-VaultQ-Request: 1` as a same-origin AJAX marker. An exact same-origin
  `Origin` also passes CSRF protection. Cross-origin cookie mutations fail.
- Legacy `localStorage.token` entries are removed. Non-secret profile, session
  key and expiry metadata remain for UX/cache purposes, never authorization.
- Changing accounts in another tab reloads the stale UI; report sessionStorage
  caches are owner-scoped. A missing/expired cookie requires sign-in, not bearer
  restoration. Old tabs should refresh when this version is deployed.

An XSS vulnerability can still act as the signed-in user while executing inside
the app. This change prevents exporting the browser's JWT for later replay; it
does not replace XSS prevention or dependency/security-header hardening.

## 8. Verification performed

- `node --test tests/*.test.cjs`: **176 tests passed**, including the new
  `tests/auth-session-security-regression.test.cjs` suite.
- `npx tsc --noEmit`, `npm run build`, and targeted ESLint completed.
- The new migration was applied and the rate-limit upsert/reset/cleanup SQL was
  exercised on a temporary local PostgreSQL 18 cluster, which was then
  removed.
- `prisma validate` passes.

Not verified:

- No migration or repair was run against the project database.
- No live database concurrency or multi-instance rate-limit test was run.
- No real Google OAuth round trip was performed.
- No physical locker/hardware flow was exercised.
- Tests for transactional workflows use transaction doubles, not live
  PostgreSQL locks.
- Next.js `16.2.9` still has known critical/high advisories; the framework
  upgrade remains pending before release.

## 9. Rollout checklist

1. Back up the database and confirm the existing schema already contains the
   pre-existing drift.
2. Apply `20261114000000_auth_sessions_and_rate_limits`.
3. Confirm `JWT_SECRET` is strong; optionally set `IMAGE_SIGNING_SECRET`.
4. Confirm HTTPS and, if self-hosting behind a proxy, `AUTH_TRUST_PROXY`.
5. Deploy the application.
6. Expect all users to sign in once more.
7. Watch for `503` responses from the rate limiter, which indicate a missing
   table, database outage, or secret problem.
8. Run staging checks for login, Google sign-in, logout in two tabs, rate
   limiting, and dashboard access with a revoked session.
