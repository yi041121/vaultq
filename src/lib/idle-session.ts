"use client";

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

export function clearClientSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Ignore storage errors; still clear the role cookie below.
  }
  document.cookie = "vq_role=; path=/; max-age=0";
}
