"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { colors } from "@/lib/design";

/**
 * Consistent filter layout:
 *   phone: search, filters, then reset on its own row
 *   desktop: search + primary action, then filters and reset on one row
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
    <div className={`space-y-3 mb-6 lg:flex lg:flex-wrap lg:items-center lg:gap-2.5 lg:space-y-0 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:contents">
        <div className="w-full sm:max-w-md lg:w-[420px] lg:max-w-none lg:flex-none">{search}</div>
        {actions && <div className="flex items-center gap-2 sm:ml-auto lg:order-3 lg:ml-0 lg:shrink-0">{actions}</div>}
      </div>
      {(filters || reset) && (
        <div className="lg:order-2 lg:ml-auto lg:flex lg:flex-nowrap lg:items-start lg:gap-2">
          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
          {reset && <div className="mt-3 flex items-center lg:mt-0">{reset}</div>}
        </div>
      )}
    </div>
  );
}

export function ResetFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border bg-white transition-colors duration-200 cursor-pointer hover:bg-[#f8fafc] whitespace-nowrap shrink-0"
      style={{ borderColor: colors.border, color: colors.primary }}
    >
      <RotateCcw size={13} />
      <span>Reset filters</span>
    </button>
  );
}
