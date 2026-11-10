"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { vcolors as c } from "@/components/ui/vault";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  className?: string;
  cell: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

/** Dense desktop table. Phone layouts use their own cards instead. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  empty = "No results found.",
  onRowClick,
  className = "",
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={`rounded-2xl border bg-white p-10 text-center ${className}`} style={{ borderColor: c.border }}>
        <Loader2 size={26} className="animate-spin mx-auto mb-3" style={{ color: c.primary }} />
        <p className="text-sm" style={{ color: c.textMuted }}>Loading...</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className={`rounded-2xl border bg-white p-10 text-center ${className}`} style={{ borderColor: c.border }}>
        <div className="text-sm font-medium" style={{ color: c.textMuted }}>{empty}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border bg-white overflow-hidden ${className}`} style={{ borderColor: c.border }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr style={{ backgroundColor: c.fill }}>
              {columns.map((column) => (
                <th key={column.key}
                  className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${column.className || ""}`}
                  style={{ color: c.textLight }}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}
                className={`border-t transition-colors duration-150 ${onRowClick ? "cursor-pointer hover:bg-[#f8fafc]" : ""}`}
                style={{ borderColor: c.borderLight }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 align-middle text-sm ${column.className || ""}`} style={{ color: c.text }}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
