"use client";

import { useEffect, useRef } from "react";
import { QUICK_ACTION_EVENT } from "@/lib/quick-actions";

/** Open a form after navigation, or immediately when its page is already open. */
export function usePageQuickAction(parameter: "add" | "edit", onAction: () => void) {
  const handlerRef = useRef(onAction);
  useEffect(() => { handlerRef.current = onAction; }, [onAction]);

  useEffect(() => {
    const current = new URL(window.location.href);
    if (current.searchParams.get(parameter) === "1") {
      // Consume only this one-shot action; preserve search, deep links and hash.
      current.searchParams.delete(parameter);
      window.history.replaceState(window.history.state, "", `${current.pathname}${current.search}${current.hash}`);
      handlerRef.current();
    }
    function trigger(event: Event) {
      const path = (event as CustomEvent<unknown>).detail;
      if (typeof path !== "string") return;
      const target = new URL(path, window.location.origin);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.searchParams.get(parameter) === "1") {
        handlerRef.current();
      }
    }
    window.addEventListener(QUICK_ACTION_EVENT, trigger);
    return () => window.removeEventListener(QUICK_ACTION_EVENT, trigger);
  }, [parameter]);
}
