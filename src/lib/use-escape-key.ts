"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `onEscape` when Escape is pressed while `active` is true.
 * `enabled` lets a modal ignore Escape while an action is in progress.
 */
export function useEscapeKey(active: boolean, onEscape: () => void, enabled = true) {
  const handlerRef = useRef(onEscape);

  useEffect(() => {
    handlerRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active || !enabled) return;
    function handle(event: KeyboardEvent) {
      if (event.key === "Escape") handlerRef.current();
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [active, enabled]);
}
