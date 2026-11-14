import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateToken } from "./auth";
import { SESSION_COOKIE } from "./session-cookie";

export type SessionUser = NonNullable<Awaited<ReturnType<typeof authenticateToken>>>;

/**
 * Data Access Layer session check.
 *
 * Proxy only verifies the signed token for an optimistic redirect. Every
 * server-rendered dashboard entry point calls this DAL instead, which performs
 * the authoritative database check: persisted session, expiry, account
 * activity and current role. React's `cache` avoids repeating the query during
 * a single render pass.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return authenticateToken(token);
});

/**
 * Requires an authenticated, active, persisted session. Optionally enforces
 * the role and sends a signed-in user to the dashboard for their real role.
 */
export async function requireSession(role?: "ADMIN" | "STUDENT"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?skip=1");
  if (role && user.role !== role) {
    redirect(user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/student");
  }
  return user;
}
