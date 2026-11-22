"use client";

import { useEffect, useRef } from "react";

/**
 * Near-real-time refresh: re-runs a lightweight loader every few seconds while
 * the tab is visible. The loader is expected to support a "silent" mode so the
 * page never flashes its skeleton, and overlapping calls are skipped.
 */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  intervalMs = 5000,
  enabled = true,
) {
  const callback = useRef(refresh);

  useEffect(() => {
    callback.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    let timer: number | undefined;

    const tick = () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      Promise.resolve(callback.current()).finally(() => {
        busy = false;
      });
    };

    timer = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
