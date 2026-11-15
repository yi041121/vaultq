"use client";

import { useEffect, useRef } from "react";

/**
 * Active Escape handlers, oldest first. Only the most recently mounted modal
 * reacts, so stacking a camera/crop dialog over a form closes one layer at a
 * time instead of dismissing everything at once.
 */
const escapeStack: Array<() => void> = [];

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
    const entry = () => handlerRef.current();
    escapeStack.push(entry);
    function handle(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Only the topmost layer consumes the key.
      if (escapeStack[escapeStack.length - 1] !== entry) return;
      handlerRef.current();
    }
    window.addEventListener("keydown", handle);
    return () => {
      const index = escapeStack.indexOf(entry);
      if (index >= 0) escapeStack.splice(index, 1);
      window.removeEventListener("keydown", handle);
    };
  }, [active, enabled]);
}
