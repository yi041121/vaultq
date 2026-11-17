# Password reset

VaultQ uses a single-use email link. The database stores only a SHA-256 hash of
the token, never the raw link or token.

## Flow

1. `POST /api/auth/forgot-password` accepts an email, applies IP + account rate
   limits and always returns the same message so account existence is not
   revealed.
2. For an active account it invalidates older reset links, stores a new hashed
   token with a 30-minute expiry, and emails the link.
3. `/reset-password` validates the token, requires an 8+ character password and
   confirmation, then `POST /api/auth/reset-password` claims the token atomically.
4. The password hash is updated, every existing session for that account is
   revoked and session cookies are cleared. The user signs in again.

## Required production environment

Set these in Vercel (Production):

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | API key from https://resend.com/api-keys |
| `PASSWORD_RESET_FROM` | Resend-verified sender, e.g. `VaultQ <no-reply@your-domain.com>` |
| `APP_URL` | Optional public origin used in links, e.g. `https://vaultq-fawn.vercel.app`. Falls back to the request origin. |

Without both Resend values, production requests return a clear 503 instead of
silently accepting a reset that cannot be delivered.

## Local development

When `RESEND_API_KEY` is absent in development, the reset URL is printed in the
terminal prefixed with `[password-reset]`. It is never logged in production.

## Admin-generated reset link

Email delivery is optional. An admin can open **Accounts → Reset password** for
an active student, generate a one-time link, and send it through an official
channel. The same 30-minute, single-use, hashed-token rules apply, and generating
a new link invalidates the previous one.

The raw link is returned only to that authenticated admin request with
`Cache-Control: no-store`; it is never stored or emailed by the app. This keeps
password reset usable before a Resend sender is configured.

## Deployment

The additive migration `20261117000000_password_reset_tokens` runs through the
guarded production build step before the app goes live. The runner accepts only
the reviewed notification-outbox and password-reset migrations and stops the
deployment if any unrelated migration is pending.

## Security properties

- Raw tokens are never stored or returned by an API.
- Tokens are 32 random bytes, URL-safe, expire after 30 minutes and are deleted
  after use.
- Concurrent submissions cannot both consume the same token.
- Password changes revoke all auth sessions for the account.
- Forgot-password responses do not reveal whether an email is registered.
- Email delivery failures are logged without tokens or email addresses.
