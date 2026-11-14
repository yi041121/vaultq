import { NextRequest, NextResponse } from "next/server";
import { revokeAuthSession } from "@/lib/auth";
import { SESSION_COOKIE, clearSessionCookies, isSameOriginAuthRequest } from "@/lib/session-cookie";

export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const header = request.headers.get("authorization") || "";
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const token = header.startsWith("Bearer ") ? header.slice(7) : cookie;
  try {
    if (token) await revokeAuthSession(token);
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    // A stale tab must not clear a newer session's routing cookie.
    if (!cookie || !token || cookie === token) clearSessionCookies(response);
    return response;
  } catch {
    return NextResponse.json({ success: false, error: "Could not complete sign-out. Please try again." }, { status: 503 });
  }
}
