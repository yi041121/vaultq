import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";

const CLIENT_ID = process.env["GOOGLE_CLIENT_ID"];
const CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"];
const ALLOWED_DOMAIN = "student.tarc.edu.my";

// GET /api/auth/google — starts the Google OAuth flow (student accounts only).
// The `hd` param pre-filters to the campus domain, but the real enforcement
// happens in the callback (hd is only a UI hint on Google's side).
export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.redirect(
      `${origin}/login?skip=1&googleError=${encodeURIComponent(
        "Google login is not configured yet. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"
      )}`
    );
  }

  const state = crypto.randomUUID();
  // Remember which entrance the user used (signup vs login) so the callback
  // can behave differently for already-registered accounts
  const intent = request.nextUrl.searchParams.get("intent") === "signup" ? "signup" : "login";
  // Carry a detected card barcode through the OAuth round-trip so the sign-up
  // form still has it when the user returns from Google.
  const bcParam = request.nextUrl.searchParams.get("bc") || "";
  const barcode = /^[0-9]{10}$/.test(bcParam) ? bcParam : "";
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: ALLOWED_DOMAIN,
    // Show the account picker every time, as requested.
    prompt: "select_account",
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  // CSRF protection: state must match the callback request
  res.cookies.set("g_state", state, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 600,
  });
  res.cookies.set("g_intent", intent, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 600,
  });
  if (barcode) {
    res.cookies.set("g_barcode", barcode, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 600,
    });
  }
  return res;
}
