"use client";

// Public cache/cross-tab metadata only. Neither value can authenticate a request.
export const SESSION_KEY = "vq_session_key";
export const SESSION_EXPIRY_KEY = "vq_session_expires";
export interface PublicBrowserSession {
  sessionKey: string;
  expiresAt: number;
  user: { id: string; name: string; email: string; role: "ADMIN" | "STUDENT"; cardBarcode: string | null };
}

export function getBrowserSessionKey(): string | null {
  try {
    // Remove credentials left by pre-cookie-only builds during migration.
    localStorage.removeItem("token");
    return localStorage.getItem(SESSION_KEY);
  } catch { return null; }
}

export function storeBrowserSession(session: PublicBrowserSession) {
  localStorage.removeItem("token");
  localStorage.setItem("user", JSON.stringify(session.user));
  localStorage.setItem(SESSION_EXPIRY_KEY, String(session.expiresAt));
  localStorage.setItem(SESSION_KEY, session.sessionKey);
}

export function clearStoredBrowserSession() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    localStorage.removeItem("user");
  } catch { /* The server cookie remains authoritative if storage is blocked. */ }
}

export function isBrowserSessionExpired() {
  try {
    const expiry = Number(localStorage.getItem(SESSION_EXPIRY_KEY));
    return !Number.isFinite(expiry) || expiry <= Date.now();
  } catch { return true; }
}
