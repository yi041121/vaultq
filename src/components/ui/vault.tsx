"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { colors, radius, size, font, iconSize } from "@/lib/design";
import { scrollPageToTop } from "@/lib/scroll-to-top";

/* ---------------------------------- Button --------------------------------- */

interface VButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
}

export function VButton({ variant = "primary", size: btnSize = "md", className = "", style, ...props }: VButtonProps) {
  const base = `inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap ${radius.button} transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed`;
  const heights = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-11 px-6 text-sm" };
  const variants: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: colors.primary, color: "#fff", boxShadow: "0 2px 6px rgba(53,92,138,0.25)" },
    secondary: { backgroundColor: colors.borderLight, color: colors.textMuted },
    outline: { backgroundColor: colors.card, color: colors.textMuted, border: `1px solid ${colors.border}` },
    danger: { backgroundColor: `color-mix(in srgb, ${colors.danger} 10%, transparent)`, color: colors.danger, border: `1px solid color-mix(in srgb, ${colors.danger} 25%, transparent)` },
    success: { backgroundColor: "#16a34a", color: "#fff", boxShadow: "0 2px 6px rgba(22,163,74,0.25)" },
    ghost: { backgroundColor: "transparent", color: colors.textMuted },
  };
  const hovers: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: colors.primaryDark, boxShadow: "0 3px 10px rgba(41,72,106,0.3)" },
    secondary: { backgroundColor: colors.border },
    outline: { backgroundColor: colors.primarySoft, borderColor: colors.primary, color: colors.primary },
    danger: { backgroundColor: `color-mix(in srgb, ${colors.danger} 18%, transparent)` },
    success: { backgroundColor: "#15803d", boxShadow: "0 3px 10px rgba(21,128,61,0.3)" },
    ghost: { backgroundColor: colors.borderLight },
  };
  const disabled = props.disabled;
  return (
    <button
      {...props}
      className={`${base} ${heights[btnSize]} ${className}`}
      style={{ ...variants[variant], ...(disabled ? { opacity: 0.5, cursor: "not-allowed", boxShadow: "none" } : {}), ...style }}
      onMouseEnter={(e) => { if (!disabled) Object.assign(e.currentTarget.style, hovers[variant]); }}
      onMouseLeave={(e) => { if (!disabled) Object.assign(e.currentTarget.style, variants[variant]); }}
    />
  );
}

/* ---------------------------------- Input ---------------------------------- */

type VInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function VInput({ className = "", style, ...props }: VInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      className={`w-full ${size.input} px-3.5 text-sm border bg-white ${radius.input} transition-colors duration-150 ${className}`}
      style={{
        ...style,
        borderColor: focused ? colors.primary : style?.borderColor ?? colors.border,
        color: style?.color ?? colors.text,
        boxShadow: focused ? "0 0 0 3px rgba(53,92,138,0.08)" : style?.boxShadow ?? "0 1px 3px rgba(0,0,0,0.02)",
      }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

export function VTextarea({ className = "", style, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm border bg-white ${radius.input} transition-colors duration-150 resize-none ${className}`}
      style={{
        ...style,
        borderColor: focused ? colors.primary : style?.borderColor ?? colors.border,
        color: style?.color ?? colors.text,
        boxShadow: focused ? "0 0 0 3px rgba(53,92,138,0.08)" : style?.boxShadow ?? "0 1px 3px rgba(0,0,0,0.02)",
      }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

/* ---------------------------------- Card ----------------------------------- */

export function VCard({ className = "", style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`vq-card bg-white ${radius.card} border ${className}`}
      style={{ borderColor: colors.border, boxShadow: "0 1px 3px rgba(0,0,0,0.02)", ...style }}
    />
  );
}

/* ----------------------------- Content panel ------------------------------- */

/** Stationary page surface shared by populated lists, empty states and forms. */
export function VContentPanel({ className = "", style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-content-panel
      className={`vq-content-panel min-w-0 w-full flex-1 flex flex-col rounded-[22px] border p-4 lg:p-6 ${className}`}
      style={{ backgroundColor: colors.panel, borderColor: colors.border, ...style }}
    />
  );
}

/* ---------------------------------- Badge ---------------------------------- */

export function VBadge({ color, children, className = "", style }: { color: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`vq-badge text-[11px] lg:text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${className}`}
      style={{ "--vq-badge-color": color, ...style } as React.CSSProperties}
    >
      {children}
    </span>
  );
}

/* ------------------------------- Filter button ------------------------------ */

export function VFilterButton({ children, style, active, onClick, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap ${size.filter} ${radius.button} text-xs sm:text-sm font-medium border bg-white transition-colors duration-200 cursor-pointer ${className}`}
      style={{ borderColor: active ? colors.primary : colors.border, color: active ? colors.primary : colors.text, backgroundColor: active ? colors.primarySoft : undefined, ...style }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ------------------------------- Search input ------------------------------ */

export function VSearchInput({ value, onChange, placeholder = "Search items...", className = "", size: inputSize = "md", clearable = false }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  size?: "md" | "lg";
  clearable?: boolean;
}) {
  const large = inputSize === "lg";
  return (
    <div className={`relative ${className}`}>
      <Search size={large ? 18 : 16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: colors.textMuted }} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${large ? "h-11 text-sm sm:h-12 sm:text-[15px]" : "h-11 text-sm"} pl-10 ${clearable ? "pr-11" : "pr-4"} border bg-white ${radius.input} transition-shadow duration-200`}
        style={{ borderColor: colors.border, color: colors.text, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
        onFocus={(e) => { e.target.style.borderColor = colors.primary; e.target.style.boxShadow = "0 0 0 3px rgba(53,92,138,0.12)"; }}
        onBlur={(e) => { e.target.style.borderColor = colors.border; e.target.style.boxShadow = "0 1px 3px rgba(0,0,0,0.02)"; }}
      />
      {clearable && value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer hover:bg-[#f1f5f9]"
          style={{ color: colors.textMuted }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/* --------------------------------- Dropdown -------------------------------- */

export function VDropdown({ trigger, children, open, onOpenChange, align = "left", width = "w-48" }: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  align?: "left" | "right";
  width?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelHoverClose() {
    if (hoverCloseRef.current) clearTimeout(hoverCloseRef.current);
    hoverCloseRef.current = null;
  }
  useEffect(() => cancelHoverClose, []);
  useEffect(() => {
    const panel = containerRef.current?.closest("[data-filter-panel]");
    if (!panel) return;
    const switchFilter = (event: Event) => {
      if ((event as CustomEvent).detail !== containerRef.current) {
        cancelHoverClose();
        onOpenChange(false);
      }
    };
    panel.addEventListener("vaultq:filter-hover", switchFilter);
    return () => panel.removeEventListener("vaultq:filter-hover", switchFilter);
  }, [onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);
  return (
    <div ref={containerRef} className="relative shrink-0"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || !event.currentTarget.closest("[data-filter-panel]")) return;
        cancelHoverClose();
        event.currentTarget.closest("[data-filter-panel]")?.dispatchEvent(new CustomEvent("vaultq:filter-hover", { detail: event.currentTarget }));
        onOpenChange(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse" || !event.currentTarget.closest("[data-filter-panel]")) return;
        cancelHoverClose();
        hoverCloseRef.current = setTimeout(() => onOpenChange(false), 180);
      }}>
      {trigger}
      {open && (
        <>
          <div
            className={`vq-dropdown-menu absolute top-11 z-20 ${align === "right" ? "right-0" : "left-0"} ${width} bg-white ${radius.dropdown} border py-1.5 shadow-lg max-h-[min(60vh,15rem)] overflow-y-auto overscroll-contain`}
            style={{ borderColor: colors.border }}
          >
            {children(() => onOpenChange(false))}
          </div>
        </>
      )}
    </div>
  );
}

export function VDropdownItem({ children, active, onSelect, style }: {
  children: React.ReactNode;
  active?: boolean;
  onSelect?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className="vq-dropdown-item w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left cursor-pointer"
      style={{ color: active ? colors.primary : colors.textMuted, backgroundColor: active ? colors.primarySoft : "transparent", fontWeight: active ? 600 : 400, ...style }}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

/* -------------------------------- Pagination ------------------------------- */

function paginationItems(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = Array.from(new Set([1, total, current - 1, current, current + 1]))
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** Shared results footer used by every paginated list. */
export function VPaginationFooter({ current, total, pageSize, itemCount, onPage }: {
  current: number;
  total: number;
  pageSize: number;
  itemCount: number;
  onPage: (p: number) => void;
}) {
  if (itemCount === 0) return null;

  function changePage(next: number) {
    if (next === current) return;
    onPage(next);
    // The helper waits for the next animation frame, so it runs after the new
    // page has rendered. It also provides a reliable smooth scroll on phones.
    scrollPageToTop();
  }

  return (
    <div className="mt-auto flex shrink-0 flex-col sm:flex-row items-center justify-between gap-3 pt-6" data-pagination-footer>
      <span className="text-xs" style={{ color: colors.textMuted }}>
        Showing {((current - 1) * pageSize) + 1}-{Math.min(current * pageSize, itemCount)} of {itemCount} results
      </span>
      <VPagination current={current} total={total} onPage={changePage} />
    </div>
  );
}

export function VPagination({ current, total, onPage }: {
  current: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total <= 1) return null;

  return (
    <div className="vq-scroll-x flex max-w-full items-center gap-1.5 sm:gap-2" role="group" aria-label="Pagination">
      <button
        type="button"
        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center border bg-white touch-manipulation select-none transition-colors duration-150 disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ borderColor: colors.border, color: colors.textMuted, WebkitTapHighlightColor: "transparent", outlineColor: colors.primary }}
        disabled={current === 1}
        aria-label="Previous page"
        onClick={() => onPage(current - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      {paginationItems(current, total).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="w-6 shrink-0 text-center text-sm" style={{ color: colors.textLight }}>…</span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={current === p ? "page" : undefined}
            className="w-9 h-9 shrink-0 rounded-full text-sm font-medium touch-manipulation select-none transition-[background-color,color,border-color,box-shadow] duration-200 cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: current === p ? colors.primary : "#fff",
              color: current === p ? "#fff" : colors.textMuted,
              border: `1px solid ${current === p ? colors.primary : colors.border}`,
              boxShadow: current === p ? "0 1px 4px rgba(53,92,138,0.22)" : "none",
              fontWeight: current === p ? 600 : 500,
              WebkitTapHighlightColor: "transparent",
              outlineColor: colors.primary,
            }}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center border bg-white touch-manipulation select-none transition-colors duration-150 disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ borderColor: colors.border, color: colors.textMuted, WebkitTapHighlightColor: "transparent", outlineColor: colors.primary }}
        disabled={current === total}
        aria-label="Next page"
        onClick={() => onPage(current + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/* ------------------------------ Category chip ------------------------------ */

export function CategoryIcon({ icon: Icon, color, size = 15 }: {
  label: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  size?: number;
}) {
  return <Icon size={size} style={{ color }} />;
}

export { font, font as vfont, colors, colors as vcolors, size as vsize, radius as vradius, iconSize, iconSize as viconSize };
