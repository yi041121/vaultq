import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { isSameOriginAuthRequest, setPasswordResetCookie } from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import {
  accountBarcodeMatches,
  normalizeCardBarcode,
  SELF_RESET_BARCODE_PATTERN,
  SELF_RESET_MISMATCH_MESSAGE,
} from "@/lib/self-reset";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiry,
} from "@/lib/password-reset";

const noStore = { "Cache-Control": "no-store" } as const;

function mismatch() {
  return NextResponse.json(
    { success: false, error: SELF_RESET_MISMATCH_MESSAGE },
    { status: 400, headers: noStore },
  );
}

// POST /api/auth/self-reset — step 1 of the self-service reset. The student
// proves ownership with their account email and the barcode printed on their
// student card. On success this issues a normal one-time reset token in an
// HttpOnly cookie and the browser moves to /reset-password, where the new
// password is chosen. No email delivery and no link.
//
// Every failure returns the same message so the endpoint cannot be used to
// discover which accounts or barcodes exist. Rate limiting happens before the
// database lookup and includes per-account budgets.
export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400, headers: noStore });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const barcode = normalizeCardBarcode(input.barcode);

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: "Enter the email address linked to your account." },
      { status: 400, headers: noStore },
    );
  }
  if (!SELF_RESET_BARCODE_PATTERN.test(barcode)) {
    return NextResponse.json(
      { success: false, error: "Enter the 10-digit barcode printed on your student card." },
      { status: 400, headers: noStore },
    );
  }

  const limited = await enforceAuthRateLimit(request, "selfReset", email);
  if (limited) return limited;

  try {
    const account = await withDbRetry(() => prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, cardBarcode: true, role: true, isActive: true },
    }));

    // Admin accounts are deliberately excluded: their sessions can moderate
    // data, so they must use another admin's link or Google verification.
    if (
      !account ||
      !account.isActive ||
      account.role !== "STUDENT" ||
      !accountBarcodeMatches(account, barcode)
    ) {
      return mismatch();
    }

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = passwordResetExpiry();

    await withDbRetry(() => prisma.$transaction(async (tx) => {
      // Only the newest reset request stays valid.
      await tx.passwordResetToken.deleteMany({ where: { userId: account.id } });
      await tx.passwordResetToken.create({ data: { userId: account.id, tokenHash, expiresAt } });
    }));

    // Audit line only: no email or barcode is written to the logs.
    console.info(`Self-service password reset verified for account ${account.id}`);

    const response = NextResponse.json({ success: true }, { headers: noStore });
    setPasswordResetCookie(response, token);
    return response;
  } catch (error) {
    if (isTransientDbError(error)) {
      return NextResponse.json(
        { success: false, error: "Password reset is temporarily unavailable. Please try again." },
        { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
      );
    }
    const details = error as { name?: string; code?: string } | null;
    console.error("Self-service password reset verification failed", {
      name: details?.name,
      code: details?.code,
    });
    return NextResponse.json(
      { success: false, error: "Password reset failed. Please try again." },
      { status: 500, headers: noStore },
    );
  }
}
