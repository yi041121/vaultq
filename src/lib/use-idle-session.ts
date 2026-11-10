"use client";

import { useEffect } from "react";
import {
  IDLE_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  clearClientSession,
  isSessionIdle,
  isTokenExpired,
  markSessionActivity,
} from "@/lib/idle-session";

type SessionRouter = { replace: (href: string) => void };

/**
 * Expires the current session after 30 minutes without user activity.
 * Runs inside StudentShell, so it covers every student and admin dashboard page.
 * Activity is shared across tabs through localStorage.
 */
export function useIdleSession(router: SessionRouter) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {
      token = null;
    }
    if (!token) {
      router.replace("/login?skip=1&expired=1");
      return;
    }
    if (isTokenExpired(token)) {
      clearClientSession();
      router.replace("/login?skip=1&expired=1");
      return;
    }

    let expired = false;
    let timer: number | undefined;
    let lastWrite = Date.now();

    const expire = () => {
      if (expired) return;
      expired = true;
      clearClientSession();
      router.replace("/login?skip=1&expired=1");
    };

    if (isSessionIdle()) {
      expire();
      return;
    }

    markSessionActivity();

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      let last = Date.now();
      try {
        const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
        if (Number.isFinite(stored) && stored > 0) last = stored;
      } catch {
        // Fall back to the in-memory timestamp.
      }
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - last);
      if (remaining <= 0) {
        expire();
        return;
      }
      timer = window.setTimeout(expire, remaining);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite >= 1000) {
        lastWrite = now;
        markSessionActivity(now);
        schedule();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) {
        schedule();
        return;
      }
      if (event.key === "token" && !event.newValue) {
        expire();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (isSessionIdle()) {
        expire();
        return;
      }
      schedule();
    };

    schedule();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll", "change"];
    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) window.clearTimeout(timer);
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
}
