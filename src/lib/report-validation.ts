// Shared validation for report details, used by both create and edit endpoints.
import { isItemCategory } from "./categories";
import { startsWithNumber } from "./text-validation";

export const VALID_REPORT_TYPES = ["LOST", "FOUND"] as const;
export type ReportTypeValue = (typeof VALID_REPORT_TYPES)[number];

export interface ReportDetailsInput {
  itemName?: unknown;
  category?: unknown;
  description?: unknown;
  location?: unknown;
  date?: unknown;
}

export interface ReportDetails {
  itemName: string;
  category: string | null;
  description: string;
  location: string;
  date: Date;
}

export type ReportDetailsResult =
  | { ok: true; value: ReportDetails }
  | { ok: false; error: string };

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Validates and normalises the editable report fields. */
export function validateReportDetails(input: ReportDetailsInput): ReportDetailsResult {
  const itemName = typeof input.itemName === "string" ? input.itemName.trim() : "";
  if (itemName.length < 2 || itemName.length > 100) {
    return { ok: false, error: "Item name must be 2-100 characters" };
  }
  if (startsWithNumber(itemName)) {
    return { ok: false, error: "Item name cannot start with a number" };
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 5 || description.length > 2000) {
    return { ok: false, error: "Description must be 5-2000 characters" };
  }
  if (startsWithNumber(description)) {
    return { ok: false, error: "Description cannot start with a number" };
  }

  const location = typeof input.location === "string" ? input.location.trim() : "";
  if (location.length < 2 || location.length > 200) {
    return { ok: false, error: "Location must be 2-200 characters" };
  }
  if (startsWithNumber(location)) {
    return { ok: false, error: "Location cannot start with a number" };
  }

  const rawCategory = typeof input.category === "string" ? input.category.trim() : "";
  if (rawCategory && !isItemCategory(rawCategory)) {
    return { ok: false, error: "Invalid category" };
  }

  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
    return { ok: false, error: "A valid date is required" };
  }
  if (date > todayIso()) {
    return { ok: false, error: "Date cannot be in the future" };
  }

  return {
    ok: true,
    value: {
      itemName,
      category: rawCategory || null,
      description,
      location,
      date: new Date(`${date}T00:00:00.000Z`),
    },
  };
}
