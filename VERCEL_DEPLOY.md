# Deploying VaultQ to Vercel

VaultQ is a Next.js app with PostgreSQL. Vercel can host the app, but the
database must also be hosted.

## 1. Create a cloud PostgreSQL database

Use Neon (recommended for Vercel + Prisma) or Supabase.

- Create a free project.
- Copy the **pooled** PostgreSQL connection string.
- Append `?sslmode=require` if it is not already present.

## 2. Create the schema and copy data

On this PC, export the local database:

```bash
pg_dump "postgresql://vaultq:vaultq123@localhost:5432/vaultq" \
  --no-owner --no-acl --clean --if-exists \
  -f vaultq-local.sql
```

Import it into the cloud database:

```bash
psql "$CLOUD_DATABASE_URL" -f vaultq-local.sql
```

If the provider uses a different role/schema, run `npx prisma db push` instead
and import data separately.

## 3. Import the project into Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → Import** the repository.
3. Add these Environment Variables for Production, Preview and Development:

```text
DATABASE_URL
JWT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
HARDWARE_API_KEY
HARDWARE_SESSION_SECRET
LOCKER_NUMBER
```

Use the values from `.env`, with `DATABASE_URL` changed to the cloud URL.

The build command is already set to:

```text
prisma generate && next build
```

## 4. Google OAuth

In Google Cloud Console → Credentials → OAuth client, add:

```text
https://YOUR-PROJECT.vercel.app/api/auth/google/callback
```

Also add the origin:

```text
https://YOUR-PROJECT.vercel.app
```

## 5. Hardware URLs

Change the ESP32 sketch from the local PC address to the Vercel address:

```text
https://YOUR-PROJECT.vercel.app/api/hardware/identify
https://YOUR-PROJECT.vercel.app/api/hardware/verify
```

Use `WiFiClientSecure` for HTTPS. Keep the same `HARDWARE_API_KEY`.

## 6. Photo uploads

Photos are compressed in the browser before upload:

- Longest side: 1400 px
- Target: at most ~800 KB per photo
- Up to 3 photos: safely below Vercel's 4.5 MB request limit

The app also keeps server-side 5 MB checks as a fallback.

## Free-tier notes

- Vercel Hobby is intended for personal/non-commercial projects.
- Neon free databases can scale to zero when idle; the first query may be slower.
- Supabase free projects can pause after a week of inactivity.
- Cloud storage (Vercel Blob, Cloudinary, S3) is recommended later if photo
  volume grows; the current demo stores compressed photos as base64 in Postgres.

## Current deployment

- Production URL: `https://vaultq-fawn.vercel.app`
- Vercel project: `zynova5/vaultq`
- Neon project: `spring-king-16945008` (VaultQ, Singapore)
- Vercel Functions region: `sin1`

## Hardware

The working sketch is at:

```text
~/Arduino/vaultq_two_step_test/vaultq_two_step_test.ino
```

It now uses `WiFiClientSecure` with:

```text
https://vaultq-fawn.vercel.app/api/hardware/identify
https://vaultq-fawn.vercel.app/api/hardware/verify
```

`setInsecure()` is used for the demo. For production, pin the Vercel/ISRG root
certificate instead of disabling certificate verification.
