import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/session-token";
import { clearSessionCookies, SESSION_COOKIE } from "@/lib/session-cookie";

// Optimistic route guard only. Proxy verifies the signed token so it can
// redirect early, but it never queries the database. Server layouts, the DAL
// and every API handler still perform the authoritative persisted-session,
// account-activity and role checks. This keeps prefetches cheap and follows
// Next.js guidance that Proxy must not be the only authorization layer.
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let role: "ADMIN" | "STUDENT" | null = null;
  if (token) {
    try {
      role = verifyToken(token).role;
    } catch {
      role = null;
    }
  }
  const { pathname } = request.nextUrl;

  if (!role) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?skip=1";
    const response = NextResponse.redirect(url);
    clearSessionCookies(response);
    return response;
  }

  if (pathname.startsWith("/dashboard/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard/student", request.url));
  }
  if (pathname.startsWith("/dashboard/student") && role !== "STUDENT") {
    return NextResponse.redirect(new URL("/dashboard/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
