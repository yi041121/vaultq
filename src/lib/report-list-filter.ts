import type { UserReport } from "./report-mapper";

export type ReportStatusFilter = "ALL" | "PENDING" | "MATCHED_CLOSED" | "VERIFIED" | "REJECTED";
export type ReportTypeFilter = "ALL" | UserReport["type"];

export const REPORT_STATUS_FILTERS: { value: ReportStatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "MATCHED_CLOSED", label: "Matched / Closed" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
];

/**
 * Statuses a report type can actually reach, mirroring the API transitions.
 * Lost reports are matched to inventory and closed when a claim is approved
 * (or rejected/withdrawn); they are never "verified". Found reports are
 * verified into inventory or rejected; they are never matched or closed.
 * "All types" offers only shared statuses; choosing Lost or Found reveals
 * its specific options. Matched/Closed share a filter, not a database status.
 */
const STATUS_FILTERS_BY_TYPE: Record<ReportTypeFilter, ReportStatusFilter[]> = {
  ALL: ["ALL", "PENDING", "REJECTED"],
  LOST: ["ALL", "PENDING", "MATCHED_CLOSED", "REJECTED"],
  FOUND: ["ALL", "PENDING", "VERIFIED", "REJECTED"],
};

/** Status filter options for the selected report type. */
export function reportStatusFilters(type: ReportTypeFilter) {
  return REPORT_STATUS_FILTERS.filter((entry) => STATUS_FILTERS_BY_TYPE[type].includes(entry.value));
}

/** Whether a status filter makes sense for the selected report type. */
export function statusIsAvailableFor(type: ReportTypeFilter, status: ReportStatusFilter): boolean {
  return STATUS_FILTERS_BY_TYPE[type].includes(status);
}

export interface ReportListFilters {
  type: ReportTypeFilter;
  status: ReportStatusFilter;
  query: string;
}

function searchText(report: UserReport) {
  return [
    report.itemName,
    report.description,
    report.location,
    report.category,
    report.reference,
    report.item?.name,
    report.studentName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Filters the student's own reports. Every whitespace-separated search token
 * must appear somewhere, so "black library" narrows instead of broadening.
 */
export function filterReports(reports: UserReport[], filters: ReportListFilters): UserReport[] {
  const tokens = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return reports.filter((report) => {
    if (filters.type !== "ALL" && report.type !== filters.type) return false;
    if (filters.status === "MATCHED_CLOSED") {
      if (report.type !== "LOST" || (report.status !== "MATCHED" && report.status !== "CLOSED")) return false;
    } else if (filters.status !== "ALL" && report.status !== filters.status) return false;
    if (!tokens.length) return true;
    const text = searchText(report);
    return tokens.every((token) => text.includes(token));
  });
}

/** True when filters hide every report the student actually has. */
export function filtersAreActive(filters: Omit<ReportListFilters, "type">): boolean {
  return filters.status !== "ALL" || filters.query.trim().length > 0;
}
