"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { colors } from "@/lib/design";

export interface PillSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Rounded search field with the icon on the right.
 *
 * On devices with a precise pointer, hovering the field focuses it so the user
 * can type immediately. Leaving the field cancels the hover focus only while
 * it is still empty, so text is never interrupted mid-typing. Touch devices
 * and keyboards keep normal tap/click focus.
 */
export function PillSearchInput({
  value, onChange, placeholder = "Search...", clearable = false, className = "", "aria-label": ariaLabel,
}: PillSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hoverFocused = useRef(false);
  const hoverTimer = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);

  function clearHoverTimer() {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }
  useEffect(() => clearHoverTimer, []);

  function supportsHoverFocus(event: React.PointerEvent<HTMLDivElement>) {
    return event.pointerType === "mouse"
      && typeof window !== "undefined"
      && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
  }

  function anotherFieldIsFocused() {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return false;
    return active.matches("input, textarea, select, [contenteditable='true']");
  }

  function handlePointerEnter(event: React.PointerEvent<HTMLDivElement>) {
    if (!supportsHoverFocus(event)) return;
    const input = inputRef.current;
    if (!input || input.value || anotherFieldIsFocused()) return;
    clearHoverTimer();
    // Small delay so merely passing the pointer across the field does not
    // steal focus while scrolling.
    hoverTimer.current = window.setTimeout(() => {
      const field = inputRef.current;
      if (!field || field.value || field === document.activeElement || anotherFieldIsFocused()) return;
      field.focus({ preventScroll: true });
      hoverFocused.current = true;
    }, 180);
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    if (!supportsHoverFocus(event)) return;
    clearHoverTimer();
    const input = inputRef.current;
    if (!input) return;
    // Only cancel an untouched hover focus; typing keeps the caret.
    if (hoverFocused.current && !input.value) input.blur();
    hoverFocused.current = false;
  }

  return (
    <div
      className={`relative ${className}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); hoverFocused.current = false; }}
        className={`h-12 w-full rounded-full border bg-white pl-5 text-sm outline-none transition-shadow duration-200 placeholder:text-[#94a3b8] ${clearable && value ? "pr-20" : "pr-12"}`}
        style={{
          borderColor: focused ? colors.primary : "rgba(148,163,184,0.38)",
          color: colors.text,
          boxShadow: focused
            ? "0 0 0 4px color-mix(in srgb, var(--vq-primary) 16%, transparent)"
            : "0 6px 20px rgba(15,23,42,0.07)",
        }}
      />
      {clearable && value && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          // Keep focus on the input so a single click clears the text instead
          // of the button stealing focus mid-edit.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            inputRef.current?.focus({ preventScroll: true });
          }}
          className="absolute right-11 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 hover:bg-[#e6eef5]"
          style={{ color: "#64748b" }}>
          <X size={15} />
        </button>
      )}
      <Search
        size={20}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
        style={{ color: colors.primary }}
      />
    </div>
  );
}
