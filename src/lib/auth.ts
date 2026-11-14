import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { withDbRetry } from "./db-retry";
import { generateToken, SESSION_SECONDS, verifyToken, type SessionClaims } from "./session-token";
import { randomUUID } from "node:crypto";

export { generateToken, verifyToken, SESSION_SECONDS, type SessionClaims };

const USER_SELECT = { id: true, name: true, email: true, role: true, cardBarcode: true, isActive: true } as const;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Creates a persistent server session and returns its signed token. Revoking
 * the database record (logout) invalidates every copy of the token at once.
 */
export async function createAuthSession(user: { id: string; role: string }): Promise<string> {
  const sessionId = randomUUID();
  const token = generateToken({ userId: user.id, role: user.role, sessionId });
  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
    },
    select: { id: true },
  });
  return token;
}

/**
 * Authoritative authentication: verifies the token AND confirms the persisted
 * session still exists, belongs to the account, is unexpired, and that the
 * account is active with the claimed role. Returns null for any failure so
 * callers cannot accidentally authorize on a stale or forged session.
 */
export async function authenticateToken(token: string) {
  try {
    const payload = verifyToken(token);
    const session = await withDbRetry(() =>
      prisma.authSession.findUnique({
        where: { id: payload.jti },
        include: { user: { select: USER_SELECT } },
      })
    );
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      session.userId !== payload.userId ||
      !session.user.isActive ||
      session.user.role !== payload.role
    ) {
      return null;
    }
    return session.user;
  } catch {
    return null;
  }
}

export async function revokeAuthSession(token: string) {
  // Expired signed tokens may still identify their record for cleanup. They
  // are never accepted by authenticateToken or used to authorize other work.
  let payload: SessionClaims;
  try {
    payload = verifyToken(token, true);
  } catch {
    return;
  }
  await prisma.authSession.deleteMany({ where: { id: payload.jti, userId: payload.userId } });
}

export async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  return authenticateToken(authHeader.slice(7));
}
