import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuthSession } from "@/lib/auth";
import { withDbRetry } from "@/lib/db-retry";
import { getRequestOrigin } from "@/lib/request-origin";
import { setSessionCookies } from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";

const CLIENT_ID = process.env["GOOGLE_CLIENT_ID"];
const CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"];
const ALLOWED_DOMAIN = "student.tarc.edu.my";

// Allow the connection retries below to finish even on a cold Neon start.
export const maxDuration = 30;

// GET /api/auth/google/callback — exchanges the auth code, enforces the
// student domain, creates the student account on first sign-in, then stores a
// persistent server session in HttpOnly cookies and redirects to
// /auth/callback. No credentials or profile fields are placed in the URL.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("g_state")?.value;
  const intent = request.cookies.get("g_intent")?.value === "signup" ? "signup" : "login";
  const carriedBarcode = request.cookies.get("g_barcode")?.value || "";

  const finish = (response: NextResponse) => {
    for (const name of ["g_state", "g_intent", "g_barcode"]) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  const fail = (msg: string) => finish(
    NextResponse.redirect(`${origin}/login?skip=1&googleError=${encodeURIComponent(msg)}`)
  );

  if (searchParams.has("error")) {
    return fail(searchParams.get("error") === "access_denied"
      ? "Google sign-in was cancelled."
      : "Google sign-in failed. Please try again.");
  }

  if (!CLIENT_ID || !CLIENT_SECRET || !code || !state || state !== cookieState) {
    return fail("Session expired. Please try again.");
  }
  const limited = await enforceAuthRateLimit(request, "google");
  if (limited) return finish(limited);

  let stage = "token_exchange";
  const startedAt = Date.now();
  try {
    // Exchange authorization code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const details = await tokenRes.json().catch(() => null);
      console.error("Google token exchange failed", {
        status: tokenRes.status,
        code: typeof details?.error === "string" ? details.error : "unknown",
      });
      return fail("Google rejected the sign-in. Please try again.");
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail("Google sign-in failed. Please try again.");

    // Fetch the verified Google profile
    stage = "google_profile";
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!infoRes.ok) {
      console.error("Google userinfo failed", infoRes.status);
      return fail("Could not load your Google profile. Please try again.");
    }
    const profile = (await infoRes.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    // Domain + verification enforcement (the real gate — `hd` is only a hint).
    // Existing accounts (any domain) inside the DB can sign in with their own
    // Google identity. New @student.tarc.edu.my users are NOT auto-created —
    // they are sent to the regular sign-up form with name + email pre-filled,
    // and complete barcode/password themselves there.
    const email = String(profile.email || "").trim().toLowerCase();
    if (!profile.email_verified) return fail("Verify your Google email and try again.");

    stage = "account_lookup";
    const user = await withDbRetry(() =>
      prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, name: true, email: true, role: true, isActive: true, cardBarcode: true },
      })
    );
    if (!user) {
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        return fail(`Only @${ALLOWED_DOMAIN} accounts can register with Google.`);
      }
      // Hand the verified identity to the sign-up form
      const params = new URLSearchParams({
        skip: "1",
        name: String(profile.name || "").trim().replace(/\s+/g, " "),
        email,
      });
      if (/^[0-9]{10}$/.test(carriedBarcode)) params.set("barcode", carriedBarcode);
      return finish(NextResponse.redirect(`${origin}/register?${params}`));
    }
    // Existing account + signup intent: do NOT silently log in — the user
    // tried to register with an account that already exists
    if (intent === "signup") {
      return fail("Account already registered. Please sign in.");
    }
    if (!user.isActive) return fail("Account disabled. Contact admin.");

    stage = "session_creation";
    const token = await createAuthSession(user);
    const res = NextResponse.redirect(`${origin}/auth/callback`);
    setSessionCookies(res, token, user.role);
    return finish(res);
  } catch (error) {
    // Do not log OAuth codes, tokens, profiles, or database connection strings.
    const details = error as { name?: string; code?: string; message?: string; cause?: { code?: string } } | null;
    // Keep production logs free of PII and query text; local development gets
    // the message so a connection problem can be diagnosed quickly.
    const message = process.env.NODE_ENV !== "production"
      ? String(details?.message || "").replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 200)
      : undefined;
    console.error("Google sign-in failed", {
      stage,
      elapsedMs: Date.now() - startedAt,
      name: details?.name,
      code: details?.code || details?.cause?.code,
      message,
    });
    if (stage === "account_lookup") {
      return fail("Account service unavailable. Please try again.");
    }
    if (stage === "token_exchange" || stage === "google_profile") {
      return fail("Could not reach Google. Please try again.");
    }
    return fail("Google sign-in failed. Please try again.");
  }
}
