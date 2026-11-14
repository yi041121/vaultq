import { NextRequest, NextResponse } from "next/server";
import { authenticateToken, verifyToken } from "@/lib/auth";
import { SESSION_COOKIE, clearSessionCookies } from "@/lib/session-cookie";

// Only public profile/cache metadata is exposed. JWTs stay in HttpOnly cookies.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await authenticateToken(token) : null;
  if (!token || !user) {
    const response = NextResponse.json({ success: false, error: "Session expired" }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  const claims = verifyToken(token);
  return NextResponse.json({ success: true, data: { user, sessionKey: claims.jti, expiresAt: claims.exp * 1000 } }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
