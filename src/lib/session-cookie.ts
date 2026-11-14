import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "vq_session";
const MAX_AGE = 7 * 24 * 60 * 60;

export function setSessionCookies(response: NextResponse, token: string, role: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
  // Legacy display hint only. Never used as authentication or authorization.
  response.cookies.set("vq_role", role, { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
  response.headers.set("Cache-Control", "private, no-store");
}

export function clearSessionCookies(response: NextResponse) {
  for (const name of [SESSION_COOKIE, "vq_role"]) response.cookies.set(name, "", {
    httpOnly: name === SESSION_COOKIE, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
}

/** Mutating auth endpoints reject cross-origin requests, including subdomains. */
export function isSameOriginAuthRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
  }
  // Same-origin AJAX/non-browser clients may use an explicit custom header.
  // A cross-origin browser cannot send it without an approved CORS preflight.
  const site = request.headers.get("sec-fetch-site");
  return request.headers.get("x-vaultq-request") === "1" && site !== "cross-site" && site !== "same-site";
}
