import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, comparePassword, hashPassword, verifyToken } from "@/lib/auth";
import { SESSION_COOKIE, isSameOriginAuthRequest } from "@/lib/session-cookie";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";

// POST /api/auth/change-password — the signed-in owner replaces the password.
// Used after signing in with an administrator-issued temporary password; the
// flag is cleared in the same write and other sessions are revoked.
export async function POST(request: NextRequest) {
  if (!isSameOriginAuthRequest(request)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const limited = await enforceAuthRateLimit(request, "passwordReset", user.id);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => null);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "Current and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      return NextResponse.json({ success: false, error: "The new password must be 8 to 72 characters" }, { status: 400 });
    }

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    if (!record) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    if (!(await comparePassword(currentPassword, record.password))) {
      return NextResponse.json({ success: false, error: "The temporary password is incorrect" }, { status: 400 });
    }
    if (await comparePassword(newPassword, record.password)) {
      return NextResponse.json({ success: false, error: "Choose a password different from the temporary one" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword(newPassword),
        mustChangePassword: false,
      },
    });

    // Keep the session this browser is using, drop every other device.
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    let currentSessionId: string | null = null;
    if (token) {
      try {
        currentSessionId = verifyToken(token).jti;
      } catch {
        currentSessionId = null;
      }
    }
    await prisma.authSession.deleteMany({
      where: {
        userId: user.id,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Could not change the password" }, { status: 500 });
  }
}
