import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, createAuthSession, verifyToken } from "@/lib/auth";
import { withDbRetry } from "@/lib/db-retry";
import { isSameOriginAuthRequest, setSessionCookies } from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";

const DUMMY_PASSWORD_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Invalid sign-in details" }, { status: 400 });
    const { email: rawEmail, password } = body;
    // Case-insensitive + whitespace tolerant: matching how users actually type emails
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email || email.length > 254 || typeof password !== "string" || !password || password.length > 1024) {
      return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 400 });
    }
    const limited = await enforceAuthRateLimit(request, "login", email);
    if (limited) return limited;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "Invalid email address" }, { status: 400 });
    }

    const user = await withDbRetry(() =>
      prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      })
    );
    const isValid = await comparePassword(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !isValid) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "Account disabled. Contact admin." }, { status: 403 });
    }

    // Role is verified by the system itself, not chosen in the form.
    // Route-level access is enforced separately (src/proxy.ts) and admin APIs
    // reject non-ADMIN tokens server-side.
    const token = await createAuthSession(user);
    const claims = verifyToken(token);

    const res = NextResponse.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, cardBarcode: user.cardBarcode },
        sessionKey: claims.jti,
        expiresAt: claims.exp * 1000,
      },
    });
    setSessionCookies(res, token, user.role);
    return res;
  } catch {
    return NextResponse.json({ success: false, error: "Login failed" }, { status: 500 });
  }
}
