"use client";

import type { PublicBrowserSession } from "./browser-session-store";
export type BrowserSession = PublicBrowserSession;

let pendingSignOut: Promise<unknown> = Promise.resolve();

export async function waitForServerSignOut() { await pendingSignOut; }

export function endServerSession(expectedSessionKey?: string | null): Promise<boolean> {
  const operation = async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000),
        headers: { "X-VaultQ-Request": "1", ...(expectedSessionKey ? { "X-VaultQ-Session": expectedSessionKey } : {}) },
      });
      return response.ok;
    } catch { return false; }
  };
  const result = pendingSignOut.then(operation, operation);
  pendingSignOut = result;
  return result;
}

export async function getServerSession(): Promise<BrowserSession | null> {
  await waitForServerSignOut();
  const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Session service is unavailable. Please try again.");
  const data = await response.json();
  if (!data?.success || typeof data.data?.sessionKey !== "string" || !data.data.sessionKey || !Number.isFinite(data.data.expiresAt) || data.data.expiresAt <= Date.now() || !data.data?.user?.id
    || !["ADMIN", "STUDENT"].includes(data.data.user.role)) return null;
  return data.data as BrowserSession;
}
