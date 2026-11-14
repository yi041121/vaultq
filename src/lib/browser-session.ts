"use client";

export interface BrowserSession {
  token: string;
  user: { id: string; name: string; email: string; role: "ADMIN" | "STUDENT"; cardBarcode: string | null };
}

let pendingSignOut: Promise<unknown> = Promise.resolve();

export async function waitForServerSignOut() { await pendingSignOut; }

export function endServerSession(expectedToken?: string | null): Promise<boolean> {
  const operation = async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000),
        headers: { "X-VaultQ-Request": "1", ...(expectedToken ? { Authorization: `Bearer ${expectedToken}` } : {}) },
      });
      return response.ok;
    } catch { return false; }
  };
  const result = pendingSignOut.then(operation, operation);
  pendingSignOut = result;
  return result;
}

export async function getServerSession(existingToken?: string | null): Promise<BrowserSession | null> {
  await waitForServerSignOut();
  let response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (response.status === 401 && existingToken) {
    response = await fetch("/api/auth/session", {
      method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "X-VaultQ-Request": "1", Authorization: `Bearer ${existingToken}` },
    });
  }
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Session service is unavailable. Please try again.");
  const data = await response.json();
  if (!data?.success || typeof data.data?.token !== "string" || !data.data?.user?.id
    || !["ADMIN", "STUDENT"].includes(data.data.user.role)) return null;
  return data.data as BrowserSession;
}
