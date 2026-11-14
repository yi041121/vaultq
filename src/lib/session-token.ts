import jwt from "jsonwebtoken";
import { getJwtSecret } from "./auth-secrets";

export const JWT_ISSUER = "vaultq";
export const JWT_AUDIENCE = "vaultq-web";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export type SessionClaims = jwt.JwtPayload & {
  userId: string;
  role: "ADMIN" | "STUDENT";
  jti: string;
  exp: number;
};

/**
 * Signs a session token. `sessionId` is the persistent AuthSession id, so a
 * valid signature alone never authorizes a request: the database record must
 * still exist, match the account, and remain active.
 */
export function generateToken(payload: { userId: string; role: string; sessionId: string }): string {
  return jwt.sign({ userId: payload.userId, role: payload.role }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: SESSION_SECONDS,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: payload.sessionId,
  });
}

/**
 * Verifies the token's signature and claims only. This is deliberately
 * database-free so Proxy can run an optimistic redirect check. Server
 * layouts, route handlers and the DAL must use `authenticateToken` for the
 * authoritative session/account/role check.
 */
export function verifyToken(token: string, ignoreExpiration = false): SessionClaims {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    ignoreExpiration,
  });
  if (
    typeof payload === "string" ||
    typeof payload.userId !== "string" ||
    !payload.userId ||
    (payload.role !== "ADMIN" && payload.role !== "STUDENT") ||
    typeof payload.jti !== "string" ||
    !payload.jti ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp)
  ) {
    throw new Error("Invalid session token");
  }
  return payload as SessionClaims;
}
