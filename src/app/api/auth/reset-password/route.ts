import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { withDbRetry } from "@/lib/db-retry";
import {
  clearPasswordResetCookie,
  clearSessionCookies,
  isSameOriginAuthRequest,
  PASSWORD_RESET_COOKIE,
} from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import { hashPasswordResetToken, isPlausibleResetToken, PASSWORD_RESET_UNAVAILABLE_MESSAGE } from "@/lib/password-reset";

class InvalidResetTokenError extends Error {}

const RESET_EXPIRED_MESSAGE = "This reset request is invalid or has expired. Verify your account details again.";

// Reads the token from an explicit link/body first, then from the HttpOnly
// cookie issued by the self-service verification step.
function readResetToken(request: NextRequest, explicit?: unknown): string {
  const supplied = typeof explicit === "string" ? explicit.trim() : "";
  if (supplied) return supplied;
  return request.cookies.get(PASSWORD_RESET_COOKIE)?.value?.trim() || "";
}

// GET /api/auth/reset-password?token=... — lets the page reject stale links
// early. With no query token it validates the self-service cookie instead.
export async function GET(request: NextRequest) {
  const token = readResetToken(request, new URL(request.url).searchParams.get("token"));
  if (!isPlausibleResetToken(token)) {
    const response = NextResponse.json({ success: true, data: { valid: false } }, { headers: { "Cache-Control": "no-store" } });
    clearPasswordResetCookie(response);
    return response;
  }
  const limited = await enforceAuthRateLimit(request, "lookup", hashPasswordResetToken(token), {
    unavailableMessage: PASSWORD_RESET_UNAVAILABLE_MESSAGE,
  });
  if (limited) return limited;

  const record = await withDbRetry(() => prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    select: { usedAt: true, expiresAt: true, user: { select: { isActive: true } } },
  })).catch(() => null);

  const valid = Boolean(record && !record.usedAt && record.expiresAt.getTime() > Date.now() && record.user.isActive);
  const response = NextResponse.json({ success: true, data: { valid } }, { headers: { "Cache-Control": "no-store" } });
  if (!valid) clearPasswordResetCookie(response);
  return response;
}

// POST /api/auth/reset-password — consumes the one-time token and signs out
// every existing session for that account.
export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const token = readResetToken(request, input.token);
  const password = input.password;
  if (!isPlausibleResetToken(token)) {
    const response = NextResponse.json({ success: false, error: RESET_EXPIRED_MESSAGE }, { status: 400 });
    clearPasswordResetCookie(response);
    return response;
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 1024) {
    return NextResponse.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(token);
  const limited = await enforceAuthRateLimit(request, "passwordReset", tokenHash, {
    unavailableMessage: PASSWORD_RESET_UNAVAILABLE_MESSAGE,
  });
  if (limited) return limited;

  try {
    const record = await withDbRetry(() => prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { isActive: true } } },
    }));
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || !record.user.isActive) {
      throw new InvalidResetTokenError();
    }

    const hashedPassword = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      // Claim the token atomically so concurrent submissions cannot both win.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new InvalidResetTokenError();
      await tx.user.update({ where: { id: record.userId }, data: { password: hashedPassword } });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await tx.authSession.deleteMany({ where: { userId: record.userId } });
    });

    const response = NextResponse.json({
      success: true,
      data: { message: "Your password has been updated. Sign in with your new password." },
    }, { headers: { "Cache-Control": "no-store" } });
    clearPasswordResetCookie(response);
    clearSessionCookies(response);
    return response;
  } catch (error) {
    if (error instanceof InvalidResetTokenError) {
      const response = NextResponse.json({ success: false, error: RESET_EXPIRED_MESSAGE }, {
        status: 400, headers: { "Cache-Control": "no-store" },
      });
      clearPasswordResetCookie(response);
      return response;
    }
    return NextResponse.json({ success: false, error: "Password reset failed. Please try again." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}
