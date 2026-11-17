# Password reset

VaultQ's primary reset is self-service and needs no email delivery and no
admin. It takes two steps:

1. **Verify the account** — the student enters the account email and the
   10-digit barcode printed on their student card.
2. **Choose a new password** — the reset page accepts the new password and
   confirmation.

A one-time token connects the two steps. It is stored hashed with a 30-minute
expiry and sent to the browser in an HttpOnly cookie, so it never appears in a
URL, browser history or referrer header. The student never receives a link.

## Step 1: verify the account

`POST /api/auth/self-reset` accepts `email` and `barcode`.

- Email is matched case-insensitively.
- The barcode must be exactly the 10 digits stored on the account.
- Only active `STUDENT` accounts are eligible; admin accounts must use another
  admin's link.
- Every failed attempt returns the same message, so the endpoint does not
  reveal whether an account exists or whether the barcode was wrong.
- Comparisons are constant-time.
- Rate limits: 10 attempts per IP per 15 minutes, 5 per account and 5 per
  account/IP per 15 minutes, and 20 per account per day. The per-account
  budgets survive IP changes.
- The audit log records only the account id, never the email or barcode.

On success the previous token for that account is deleted, a new hashed token
is created, and the raw token is placed in the `vq_reset` cookie
(`HttpOnly`, `SameSite=Lax`, `Secure` in production, 30-minute lifetime).

### Security trade-off

The barcode is printed on the student card. A photo of a card, combined with
the student's campus email, is enough to reset that student's password. Rate
limiting and the exact-match requirement make guessing impractical, but this is
a possession/knowledge check, not a cryptographic identity check. Keep the
admin link available for cases where identity is disputed, and review the
`Self-service password reset verified` log lines if an account is reported as
taken over.

## Step 2: choose a new password

`/reset-password` validates the token from the cookie (or from a `?token=` link
for the admin link flow), then `POST /api/auth/reset-password` claims the token
atomically, replaces the password hash, deletes every reset token for the
account, revokes every existing session and clears the session and reset
cookies. The same token cannot be used twice.

## Admin-generated reset link

An admin can open **Accounts → Reset password** for an active student, generate
a one-time link, and send it through an official channel. The same 30-minute,
single-use, hashed-token rules apply, and generating a new link invalidates the
previous one.

The raw link is returned only to that authenticated admin request with
`Cache-Control: no-store`; it is never stored or emailed by the app. This is the
fallback for students without their card or whose account details do not match.

## Email link (optional, not shown in the UI)

`POST /api/auth/forgot-password` stores a hashed 30-minute token and emails the
link. It remains available for deployments that configure Resend, but the
forgot-password page does not offer it.

### Required environment

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | API key from https://resend.com/api-keys |
| `PASSWORD_RESET_FROM` | Resend-verified sender, e.g. `VaultQ <no-reply@your-domain.com>` |
| `APP_URL` | Optional public origin used in links, e.g. `https://vaultq-fawn.vercel.app`. Falls back to the request origin. |

Without both Resend values, production requests return a clear 503 instead of
silently accepting a reset that cannot be delivered.

### Local development

When `RESEND_API_KEY` is absent in development, the reset URL is printed in the
terminal prefixed with `[password-reset]`. It is never logged in production.

## Deployment

The additive migration `20261117000000_password_reset_tokens` runs through the
guarded production build step before the app goes live. The runner accepts only
the reviewed notification-outbox and password-reset migrations and stops the
deployment if any unrelated migration is pending.

## Security properties

- Raw tokens are never stored or returned by an API.
- Self-service tokens are delivered only in an HttpOnly cookie, never a URL.
- Tokens are 32 random bytes, URL-safe, expire after 30 minutes and are deleted
  after use.
- Concurrent submissions cannot both consume the same token.
- Password changes revoke all auth sessions for the account.
- Self-reset and forgot-password responses do not reveal whether an email is
  registered.
- Email delivery failures are logged without tokens or email addresses.
