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
  /** Type and reset controls shown beside the status filter on one row. */
  trailing?: React.ReactNode;
}

/**
 * Search + status filter for the student's own reports. On phones the search
 * field keeps its own row while status, type and reset share the next row so
 * the controls do not stack into four full-width rows.
 */
export function ReportListToolbar({ query, onQueryChange, type, status, onStatusChange, trailing }: ReportListToolbarProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const options = reportStatusFilters(type);
  const statusLabel = options.find((entry) => entry.value === status)?.label ?? "All statuses";
  const narrowed = status !== "PENDING" && status !== "ALL";

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <PillSearchInput value={query} onChange={onQueryChange} clearable
        className="w-full min-w-0 sm:w-[300px] lg:w-[360px] xl:w-[420px]"
        placeholder="Search your reports..." aria-label="Search your reports" />
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <VDropdown open={statusOpen} onOpenChange={setStatusOpen} width="w-[180px]"
          className="min-w-0 flex-1 sm:flex-none"
          trigger={
            <VFilterButton aria-label={`Filter by status: ${statusLabel}`}
              aria-haspopup="listbox" aria-expanded={statusOpen}
              className="w-full justify-between sm:w-[164px]"
              style={narrowed ? { borderColor: c.primary, color: c.primary, backgroundColor: c.primarySoft } : undefined}
              onClick={() => setStatusOpen((open) => !open)}>
              <span className="min-w-0 truncate">{statusLabel}</span>
              <ChevronDown size={14} className="shrink-0" />
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
        {trailing}
      </div>
    </div>
  );
}
