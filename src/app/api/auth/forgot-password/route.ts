import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { isSameOriginAuthRequest } from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetEmailConfigured,
  passwordResetExpiry,
  sendPasswordResetEmail,
} from "@/lib/password-reset";

const GENERIC_RESPONSE = {
  success: true,
  data: { message: "If an account exists for that email, a reset link has been sent." },
};

// POST /api/auth/forgot-password — public, rate-limited, never reveals accounts.
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

  const email = typeof (body as Record<string, unknown>).email === "string"
    ? ((body as Record<string, unknown>).email as string).trim().toLowerCase()
    : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 });
  }

  const limited = await enforceAuthRateLimit(request, "passwordReset", email);
  if (limited) return limited;

  // Fail closed in production when delivery is not configured. Checking this
  // before the account lookup avoids revealing whether an email is registered.
  if (process.env.NODE_ENV === "production" && !passwordResetEmailConfigured()) {
    return NextResponse.json(
      { success: false, error: "Password reset email is not available yet. Please contact an admin." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const user = await withDbRetry(() => prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, isActive: true },
      select: { id: true, name: true, email: true },
    }));

    if (user) {
      const token = createPasswordResetToken();
      const tokenHash = hashPasswordResetToken(token);
      const expiresAt = passwordResetExpiry();

      await prisma.$transaction(async (tx) => {
        // Only the newest link stays valid.
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
      });

      try {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: buildPasswordResetUrl(request.nextUrl.origin, token),
        });
      } catch {
        // Keep the response generic; operators can see the delivery failure.
        console.error("Password reset email delivery failed");
      }
    }
  } catch {
    console.error("Password reset request failed");
    return NextResponse.json(
      { success: false, error: "Password reset is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(GENERIC_RESPONSE, { headers: { "Cache-Control": "no-store" } });
}
