"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { colors } from "@/lib/design";
import { VFilterButton } from "@/components/ui/vault";

/** Shared outlined status buttons used throughout the admin pages. */
export function AdminStatusFilters<T extends string>({ options, value, onChange }: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label="Filter by status" className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      {options.map((option) => (
        <VFilterButton key={option.value} active={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </VFilterButton>
      ))}
    </div>
  );
}

/**
 * Consistent filter layout:
 * Search and record actions stay together; filters can wrap independently.
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
    <div data-filter-panel
      className={`shrink-0 rounded-2xl border p-4 lg:p-5 space-y-3 mb-6 lg:mb-8 lg:flex lg:flex-wrap lg:items-center lg:gap-3 lg:space-y-0 ${className}`}
      style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
      <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto">
        <div className="min-w-0 flex-1 sm:max-w-md lg:w-[360px] xl:w-[420px] lg:max-w-none lg:flex-none">{search}</div>
        {actions && <div role="group" aria-label="Page actions" className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {(filters || reset) && (
        <div className="min-w-0 max-w-full lg:order-2 lg:ml-auto">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 sm:gap-2">
            {filters}
            {reset}
          </div>
        </div>
      )}
    </div>
  );
}

export function ResetFiltersButton({ onClick, disabled = false, className = "" }: { onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border bg-white transition-colors duration-200 cursor-pointer enabled:hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 ${className}`}
      style={{ borderColor: colors.border, color: disabled ? colors.textMuted : colors.primary }}
    >
      <RotateCcw size={13} />
      <span>Reset filters</span>
    </button>
  );
}
