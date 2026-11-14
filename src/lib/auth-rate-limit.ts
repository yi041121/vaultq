import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "./prisma";
import { getJwtSecret } from "./auth-secrets";

type Action = "login" | "register" | "lookup" | "google" | "barcode" | "report" | "claim" | "suggestion";
type Bucket = { scope: string; identity: string; limit: number; seconds: number };

export function authClientIdentity(request: NextRequest): string {
  // Vercel overwrites this header at its edge. Self-hosting must explicitly
  // opt into trusting a proxy which strips client-supplied forwarding headers.
  const trusted = process.env.VERCEL === "1" || process.env.AUTH_TRUST_PROXY === "true";
  if (!trusted) return "untrusted-client";
  const name = process.env.VERCEL === "1" ? "x-vercel-forwarded-for" : "x-forwarded-for";
  const ip = (request.headers.get(name) || "").split(",")[0].trim();
  const version = isIP(ip);
  if (!version) return "untrusted-client";
  return version === 6 ? new URL(`http://[${ip}]/`).hostname.replace(/^\[|\]$/g, "").toLowerCase() : ip;
}

function buckets(action: Action, ip: string, identity?: string): Bucket[] {
  const limits: Record<Action, { limit: number; seconds: number }> = {
    login: { limit: 100, seconds: 900 }, register: { limit: 20, seconds: 3600 },
    lookup: { limit: 60, seconds: 60 }, google: { limit: 30, seconds: 300 }, barcode: { limit: 10, seconds: 300 },
    report: { limit: 2000, seconds: 3600 }, claim: { limit: 2000, seconds: 3600 }, suggestion: { limit: 6000, seconds: 60 },
  };
  const result: Bucket[] = [{ scope: `${action}:ip`, identity: ip, ...limits[action] }];
  if (action === "login" && identity) {
    result.push({ scope: "login:account-ip", identity: `${identity}:${ip}`, limit: 10, seconds: 900 });
    result.push({ scope: "login:account", identity, limit: 30, seconds: 900 });
  }
  if ((action === "report" || action === "claim" || action === "suggestion") && identity) {
    // Account limits survive IP changes; generous IP caps avoid penalising a
    // whole campus sharing NAT. Check these before parsing/decoding uploads.
    result.unshift({ scope: `${action}:account`, identity, limit: action === "suggestion" ? 60 : 30, seconds: action === "suggestion" ? 60 : 3600 });
  }
  return result;
}

export async function checkAuthRateLimit(request: NextRequest, action: Action, identity?: string) {
  const ip = authClientIdentity(request);
  for (const bucket of buckets(action, ip, identity?.trim().toLowerCase())) {
    // Neither email addresses nor client IPs are stored in the limiter table.
    const key = createHmac("sha256", getJwtSecret()).update(`vaultq:rate:v1:${bucket.scope}:${bucket.identity}`).digest("hex");
    const rows = await prisma.$queryRaw<{ attempts: number; resetAt: Date; retryAfter: number }[]>`
      WITH clock AS (SELECT clock_timestamp() AS ts)
      INSERT INTO "auth_rate_limit_buckets" AS b ("key", "attempts", "reset_at")
      SELECT ${key}, 1, ts + (${bucket.seconds} * INTERVAL '1 second') FROM clock
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN b.reset_at <= (SELECT ts FROM clock) THEN 1 ELSE LEAST(b.attempts + 1, ${bucket.limit + 1}) END,
        "reset_at" = CASE WHEN b.reset_at <= (SELECT ts FROM clock) THEN (SELECT ts FROM clock) + (${bucket.seconds} * INTERVAL '1 second') ELSE b.reset_at END
      RETURNING attempts, reset_at AS "resetAt",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - clock_timestamp()))))::int AS "retryAfter"
    `;
    if (rows.length !== 1) throw new Error("Rate limit store unavailable");
    if (rows[0].attempts > bucket.limit) return { allowed: false, retryAfter: rows[0].retryAfter };
  }
  // Bounded occasional cleanup; never a full-table delete on a login request.
  if (Math.random() < 0.01) {
    await prisma.$executeRaw`DELETE FROM "auth_rate_limit_buckets" WHERE "key" IN (SELECT "key" FROM "auth_rate_limit_buckets" WHERE reset_at < clock_timestamp() - INTERVAL '1 day' LIMIT 500)` .catch(() => {});
    await prisma.$executeRaw`DELETE FROM "auth_sessions" WHERE id IN (SELECT id FROM "auth_sessions" WHERE expires_at < clock_timestamp() - INTERVAL '1 day' LIMIT 500)` .catch(() => {});
  }
  return { allowed: true, retryAfter: 0 };
}

export async function enforceAuthRateLimit(request: NextRequest, action: Action, identity?: string): Promise<NextResponse | null> {
  try {
    const result = await checkAuthRateLimit(request, action, identity);
    if (result.allowed) return null;
    return NextResponse.json({ success: false, error: "Too many attempts. Please try again later." }, {
      status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" },
    });
  } catch {
    // A missing migration, unavailable store or invalid secret must not turn
    // into unlimited login attempts. No raw query/PII/connection details logged.
    console.error("Authentication rate-limit service unavailable");
    return NextResponse.json({ success: false, error: "Sign-in service temporarily unavailable. Please try again." }, {
      status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}
