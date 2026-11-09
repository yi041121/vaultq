import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";

const CLIENT_ID = process.env["GOOGLE_CLIENT_ID"];
const CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"];
const ALLOWED_DOMAIN = "student.tarc.edu.my";

// GET /api/auth/google/callback — exchanges the auth code, enforces the
// student domain, creates the student account on first sign-in, then hands
// the app JWT to the client via /auth/callback.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("g_state")?.value;
  const intent = request.cookies.get("g_intent")?.value === "signup" ? "signup" : "login";
  const carriedBarcode = request.cookies.get("g_barcode")?.value || "";

  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/login?skip=1&googleError=${encodeURIComponent(msg)}`);

  if (!CLIENT_ID || !CLIENT_SECRET || !code || !state || state !== cookieState) {
    return fail("Google login session expired or invalid. Please try again.");
  }

  try {
    // Exchange authorization code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("Google login failed. Please try again.");
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail("Google login failed. Please try again.");

    // Fetch the verified Google profile
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return fail("Could not verify your Google account. Please try again.");
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
    if (!profile.email_verified) return fail("Your Google email is not verified. Please try again.");

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (!user) {
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        return fail(
          `Only @${ALLOWED_DOMAIN} accounts can register with Google. If you are a staff/admin, sign in with your email and password instead.`
        );
      }
      // Hand the verified identity to the sign-up form
      const params = new URLSearchParams({
        skip: "1",
        name: String(profile.name || "").trim().replace(/\s+/g, " "),
        email,
      });
      if (/^[0-9]{10}$/.test(carriedBarcode)) params.set("barcode", carriedBarcode);
      const res = NextResponse.redirect(`${origin}/register?${params}`);
      // The barcode has been handed over — no need to keep the cookie around
      res.cookies.set("g_barcode", "", { path: "/", maxAge: 0 });
      res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
      return res;
    }
    // Existing account + signup intent: do NOT silently log in — the user
    // tried to register with an account that already exists
    if (intent === "signup") {
      return fail("This account is already registered. Please sign in instead.");
    }
    if (!user.isActive) return fail("Account disabled. Contact admin.");

    const token = generateToken({ userId: user.id, role: user.role });

    const res = NextResponse.redirect(
      `${origin}/auth/callback?token=${encodeURIComponent(token)}` +
        `&name=${encodeURIComponent(user.name)}` +
        `&email=${encodeURIComponent(user.email)}` +
        `&role=${user.role}` +
        `&id=${encodeURIComponent(user.id)}` +
        `&barcode=${encodeURIComponent(user.cardBarcode || "")}`
    );
    res.cookies.set("vq_role", user.role, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 7 });
    // Consume the one-time state cookie
    res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    return fail("Google login failed. Please try again.");
  }
}
