"use client";

import { clearStudentCache } from "@/lib/student-cache";

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const LAST_ACTIVITY_KEY = "vq_last_activity";

export function markSessionActivity(now = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // Storage can be unavailable in private modes; the in-memory timer still works.
  }
}

export function isSessionIdle(now = Date.now()) {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return false;
    const last = Number(raw);
    return Number.isFinite(last) && last > 0 && now - last > IDLE_TIMEOUT_MS;
  } catch {
    return false;
  }
}

/** Client-side expiry check for UX only; the server still verifies the JWT. */
export function isTokenExpired(token: string) {
  try {
    const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") || "";
    const padded = encoded.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function clearClientSession() {
  if (typeof window === "undefined") return;
  clearStudentCache();
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Ignore storage errors; still clear the role cookie below.
  }
  document.cookie = "vq_role=; path=/; max-age=0";
}
