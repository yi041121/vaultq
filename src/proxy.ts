import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Route-level role guard: students can only load /dashboard/student/*,
// admins can only load /dashboard/admin/*. Enforced server-side before render.
export function proxy(request: NextRequest) {
  const role = request.cookies.get("vq_role")?.value;
  const { pathname } = request.nextUrl;

  if (!role) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?skip=1";
    return NextResponse.redirect(url);
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
