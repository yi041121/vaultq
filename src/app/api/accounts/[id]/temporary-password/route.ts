import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hashPassword } from "@/lib/auth";
import { withDbRetry, isTransientDbError } from "@/lib/db-retry";
import { isSameOriginAuthRequest } from "@/lib/session-cookie";
import { recordAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/accounts/:id/temporary-password — an administrator issues a
// temporary password. The student signs in with it, is forced to the
// change-password screen and replaces it before using anything else.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
  if (!isSameOriginAuthRequest(request)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 128) {
    return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
  }
  if (id === user.id) {
    return NextResponse.json(
      { success: false, error: "Use your own account settings to change your password." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const temporaryPassword = typeof body?.password === "string" ? body.password : "";
  if (temporaryPassword.length < 8 || temporaryPassword.length > 72) {
    return NextResponse.json(
      { success: false, error: "The temporary password must be 8 to 72 characters" },
      { status: 400 },
    );
  }

  try {
    const target = await withDbRetry(() => prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, isActive: true },
    }));
    if (!target) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    if (!target.isActive) {
      return NextResponse.json(
        { success: false, error: "Activate the account before issuing a temporary password." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(temporaryPassword);
    await withDbRetry(() => prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { password: passwordHash, mustChangePassword: true },
      });
      // Anyone already signed in with the old password loses access.
      await tx.authSession.deleteMany({ where: { userId: target.id } });
    }));

    await recordAudit({
      actor: { id: user.id, name: user.name },
      action: "ACCOUNT_TEMP_PASSWORD",
      entityType: "ACCOUNT",
      entityId: target.id,
      summary: `Issued a temporary password for "${target.name}" (${target.email})`,
    });

    return NextResponse.json({
      success: true,
      data: { name: target.name, email: target.email },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const details = error as { name?: string; code?: string } | null;
    console.error("Temporary password issue failed", { name: details?.name, code: details?.code });
    if (isTransientDbError(error)) {
      return NextResponse.json(
        { success: false, error: "Password service is temporarily unavailable. Please try again." },
        { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ success: false, error: "Could not set the temporary password" }, { status: 500 });
  }
}
