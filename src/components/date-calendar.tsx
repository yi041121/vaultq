"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { vcolors as c } from "@/components/ui/vault";

function toISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

interface DateCalendarProps {
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
  /** Tighter layout for dialogs; the report form keeps the roomier version. */
  compact?: boolean;
}

/**
 * Month calendar used by the report forms. Clicking the same date twice
 * confirms it; Clear resets the value and closes the panel.
 */
export function DateCalendar({ value, onChange, onClose, compact = false }: DateCalendarProps) {
  const today = new Date();
  const todayIso = toISO(today);
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [offset, setOffset] = useState(() => {
    if (!value) return 0;
    const selected = new Date(`${value}T00:00:00`);
    return (selected.getFullYear() - today.getFullYear()) * 12 + selected.getMonth() - today.getMonth();
  });
  const [draft, setDraft] = useState(value);
  const [clicked, setClicked] = useState<string | null>(null);

  const calendarMonth = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const canGoNextMonth = calendarMonth < currentMonthStart;

  return (
    <div
      className={`${compact ? "w-[248px] p-3" : "w-[300px] p-4"} max-w-[calc(100vw-3rem)] rounded-2xl border bg-white shadow-xl`}
      style={{ borderColor: c.border }}
    >
      <div className={`flex items-center justify-between ${compact ? "mb-2" : "mb-3"}`}>
        <button type="button"
          className={`${compact ? "w-6 h-6" : "w-7 h-7"} rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer`}
          style={{ backgroundColor: c.fill, color: c.textMuted }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.fill; }}
          onClick={() => setOffset(offset - 1)}>
          <ChevronLeft size={compact ? 13 : 14} />
        </button>
        <span className={compact ? "text-[11px] font-semibold" : "text-xs font-medium"} style={{ color: c.primary }}>
          {calendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </span>
        <button type="button" disabled={!canGoNextMonth}
          className={`${compact ? "w-6 h-6" : "w-7 h-7"} rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed`}
          style={{ backgroundColor: c.fill, color: c.textMuted }}
          onMouseEnter={(e) => { if (canGoNextMonth) e.currentTarget.style.backgroundColor = c.borderLight; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.fill; }}
          onClick={() => setOffset(offset + 1)}>
          <ChevronRight size={compact ? 13 : 14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <span key={day} className={compact ? "text-[9px] font-semibold py-0.5" : "text-[10px] font-semibold py-1"} style={{ color: c.textMuted }}>{day}</span>
        ))}
        {monthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((day, index) => {
          if (!day) return <span key={index} />;
          const iso = toISO(day);
          const isSelected = draft === iso;
          const isFuture = iso > todayIso;
          return (
            <button key={index} type="button" disabled={isFuture}
              className={`${compact ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-xs"} mx-auto rounded-full transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed`}
              style={{
                backgroundColor: isSelected ? c.primary : "transparent",
                color: isSelected ? "#fff" : c.text,
                fontWeight: isSelected ? "700" : "400",
              }}
              onMouseEnter={(e) => { if (!isSelected && !isFuture) e.currentTarget.style.backgroundColor = c.fill; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
              onClick={() => {
                if (clicked === iso) {
                  setDraft(iso);
                  onChange(iso);
                  onClose();
                  return;
                }
                setDraft(iso);
                setClicked(iso);
              }}>
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className={`flex items-center justify-between ${compact ? "mt-2 pt-2" : "mt-3 pt-3"} border-t`} style={{ borderColor: c.fill }}>
        <button type="button"
          className={`${compact ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs"} rounded-lg font-medium transition-all duration-200 cursor-pointer`}
          style={{ backgroundColor: c.fill, color: c.textMuted }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.fill; }}
          onClick={() => { setDraft(""); setClicked(null); onChange(""); onClose(); }}>
          Clear
        </button>
        <button type="button" disabled={!draft}
          className={`${compact ? "h-7 px-3 text-[11px]" : "h-8 px-4 text-xs"} rounded-lg font-semibold transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
          style={{ backgroundColor: c.primary, color: "#fff" }}
          onMouseEnter={(e) => { if (draft) e.currentTarget.style.backgroundColor = c.primaryDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.primary; }}
          onClick={() => { onChange(draft); onClose(); }}>
          Confirm
        </button>
      </div>
    </div>
  );
}


interface CalendarPopoverProps extends DateCalendarProps {
  /** Trigger element the popover should sit next to. */
  anchor: HTMLElement | null;
}

/**
 * Portal-based wrapper so the calendar is never clipped by a scrolling modal.
 * It opens below the trigger, flips above when there is no room, and is
 * clamped inside the viewport on both axes.
 */
export function CalendarPopover({ anchor, compact = false, ...props }: CalendarPopoverProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!mounted || !anchor) return;
    const margin = 12;

    function update() {
      const rect = anchor!.getBoundingClientRect();
      const box = boxRef.current;
      const width = box?.offsetWidth || (compact ? 248 : 300);
      const height = box?.offsetHeight || 340;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      // Nudge the panel slightly left and up so it hugs the trigger and
      // clears the field's helper text.
      const offsetX = -10;
      const offsetY = -6;
      const left = Math.min(Math.max(margin, rect.left + offsetX), Math.max(margin, viewportW - width - margin));

      let top = rect.bottom + offsetY;
      if (top + height > viewportH - margin) {
        const above = rect.top - height + offsetY;
        top = above >= margin ? above : Math.max(margin, viewportH - height - margin);
      }

      setPos({ left, top });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [mounted, anchor, compact]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={props.onClose} />
      <div
        ref={boxRef}
        className="fixed z-[95] max-h-[calc(100vh-1.5rem)] overflow-auto overscroll-contain"
        style={{
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          maxWidth: "calc(100vw - 1.5rem)",
          visibility: pos ? "visible" : "hidden",
        }}>
        <DateCalendar {...props} compact={compact} />
      </div>
    </>,
    document.body,
  );
}
