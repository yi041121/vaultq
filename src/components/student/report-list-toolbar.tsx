"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { reportStatusFilters, type ReportStatusFilter, type ReportTypeFilter } from "@/lib/report-list-filter";
import { VDropdown, VDropdownItem, VFilterButton, vcolors as c } from "@/components/ui/vault";
import { PillSearchInput } from "@/components/pill-search-input";

export interface ReportListToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  type: ReportTypeFilter;
  status: ReportStatusFilter;
  onStatusChange: (value: ReportStatusFilter) => void;
}

/**
 * Search + status filter for the student's own reports. The status trigger
 * reuses VFilterButton so it matches the type dropdown beside it. Pending is
 * the default view and stays neutral; the field only turns blue once a
 * narrower status is chosen.
 */
export function ReportListToolbar({ query, onQueryChange, type, status, onStatusChange }: ReportListToolbarProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const options = reportStatusFilters(type);
  const statusLabel = options.find((entry) => entry.value === status)?.label ?? "All statuses";
  const narrowed = status !== "PENDING" && status !== "ALL";

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <PillSearchInput value={query} onChange={onQueryChange} clearable
        className="w-full min-w-0 sm:w-[300px] lg:w-[360px] xl:w-[420px]"
        placeholder="Search your reports..." aria-label="Search your reports" />
      <VDropdown open={statusOpen} onOpenChange={setStatusOpen} width="w-[150px]"
        trigger={
          <VFilterButton aria-label={`Filter by status: ${statusLabel}`}
            aria-haspopup="listbox" aria-expanded={statusOpen}
            style={narrowed ? { borderColor: c.primary, color: c.primary, backgroundColor: c.primarySoft } : undefined}
            onClick={() => setStatusOpen((open) => !open)}>
            <span className="max-w-[110px] truncate">{statusLabel}</span>
            <ChevronDown size={14} />
          </VFilterButton>
        }>
        {(close) => (
          <>
            {options.map((entry) => (
              <VDropdownItem key={entry.value} dense active={entry.value === status}
                onSelect={() => { onStatusChange(entry.value); close(); }}>
                {entry.label}
              </VDropdownItem>
            ))}
          </>
        )}
      </VDropdown>
    </div>
  );
}
