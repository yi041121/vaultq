"use client";

import { studentQuickActions } from "@/lib/quick-actions";
import { vcolors as c } from "@/components/ui/vault";

/** Compact icon shortcuts shared by the phone and desktop dashboard.
 * These are navigation actions, not selectable tabs or decorative statistics. */
export function DashboardQuickActions({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <nav aria-label="Dashboard quick actions" className="mb-6 rounded-2xl border bg-white px-2 py-4 sm:px-6 sm:py-5" style={{ borderColor: c.border }}>
      <div className="grid min-w-0 grid-cols-4 items-start gap-1.5 sm:gap-6">
        {studentQuickActions.map((action, index) => (
          <button key={action.path} type="button" aria-label={action.label} title={action.desc}
            onClick={() => onNavigate(action.path)}
            className="group flex min-w-0 flex-col items-center gap-2 rounded-xl px-0.5 py-1 text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355C8A] sm:gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-95 sm:h-16 sm:w-16"
              style={{ backgroundColor: index === 0 ? c.primary : c.primarySoft, borderColor: index === 0 ? c.primary : c.border, color: index === 0 ? "#fff" : c.primary }}>
              <action.icon size={23} aria-hidden="true" />
            </span>
            <span className="max-w-full text-[10px] font-medium leading-snug [overflow-wrap:anywhere] sm:text-sm" style={{ color: c.text }}>
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
