import { NextRequest, NextResponse } from "next/server";
import { revokeAuthSession, verifyToken } from "@/lib/auth";
import { SESSION_COOKIE, clearSessionCookies, isSameOriginAuthRequest } from "@/lib/session-cookie";

export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const expected = request.headers.get("x-vaultq-session");
  try {
    if (cookie && expected) {
      try {
        if (verifyToken(cookie, true).jti !== expected) return NextResponse.json({ success: false, error: "Session changed. Refresh before signing out." }, { status: 409 });
      } catch { /* Invalid/expired cookie can still be cleared below. */ }
    }
    if (cookie) await revokeAuthSession(cookie);
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    // A stale tab must not clear a newer session's routing cookie.
    clearSessionCookies(response);
    return response;
  } catch {
    return NextResponse.json({ success: false, error: "Could not complete sign-out. Please try again." }, { status: 503 });
  }
}
