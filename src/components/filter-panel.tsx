"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { colors } from "@/lib/design";

/**
 * Consistent filter layout:
 *   row 1: search (+ primary action)
 *   row 2: filter controls
 *   row 3: reset, only when something is active
 */
export function FilterPanel({
  search,
  actions,
  filters,
  reset,
  className = "",
}: {
  search: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  reset?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-3 mb-6 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="w-full sm:max-w-xl">{search}</div>
        {actions && <div className="flex items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {reset && <div className="flex items-center">{reset}</div>}
    </div>
  );
}

export function ResetFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border bg-white transition-colors duration-200 cursor-pointer hover:bg-[#f8fafc]"
      style={{ borderColor: colors.border, color: colors.primary }}
    >
      <RotateCcw size={13} />
      <span>Reset filters</span>
    </button>
  );
}
