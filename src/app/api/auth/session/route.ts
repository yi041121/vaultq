import { NextRequest, NextResponse } from "next/server";
import { authenticateToken } from "@/lib/auth";
import { SESSION_COOKIE, clearSessionCookies, isSameOriginAuthRequest, setSessionCookies } from "@/lib/session-cookie";

// Same-origin bootstrap for Google login and the existing bearer-token client.
// Tokens are never put in redirect URLs; responses must never be cached.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await authenticateToken(token) : null;
  if (!token || !user) {
    const response = NextResponse.json({ success: false, error: "Session expired" }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  return NextResponse.json({ success: true, data: { user, token } }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

// Restore the routing cookie only from a genuine, still-active bearer session.
export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: "Session expired" }, { status: 401 });
  const response = NextResponse.json({ success: true, data: { user, token } });
  setSessionCookies(response, token, user.role);
  return response;
}
