import type { NextRequest } from "next/server";

/**
 * Resolve the origin the browser actually used.
 *
 * Behind the Cloudflare tunnel, Next's `request.nextUrl.origin` becomes
 * `https://localhost:3000`, which would send Google OAuth back to a URL the
 * phone cannot reach. Cloudflare supplies the public host/protocol in the
 * forwarded headers, so prefer those.
 */
export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim();
  const host = forwardedHost || hostHeader || request.nextUrl.host;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : request.nextUrl.protocol.replace(":", "");

  // Keep the value host-only so a spoofed header cannot inject a full URL.
  const safeHost = /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(host) ? host : request.nextUrl.host;
  return `${proto}://${safeHost}`;
}
