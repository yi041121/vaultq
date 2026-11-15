// Shared rules for the student report form. Keep these in sync with
// src/lib/report-validation.ts so the browser and API agree.

export const REPORT_ITEM_NAME_MAX = 100;
export const REPORT_DESCRIPTION_MIN = 5;
export const REPORT_DESCRIPTION_MAX = 2000;
/** Soft target that makes description-based matching useful. */
export const REPORT_DESCRIPTION_HELPFUL = 40;
export const REPORT_LOCATION_MAX = 200;

export type ReportFormType = "LOST" | "FOUND";

export interface ReportFormValues {
  type: ReportFormType | null;
  itemName: string;
  category: string | null;
  description: string;
  location: string;
  date: string;
}

export type ReportFormErrors = Partial<Record<"itemName" | "category" | "description" | "location" | "date", string>>;

function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Validates only the user-editable fields; the report type is chosen earlier. */
export function validateReportForm(values: ReportFormValues, now = new Date()): ReportFormErrors {
  const errors: ReportFormErrors = {};
  const itemName = values.itemName.trim();
  const description = values.description.trim();
  const location = values.location.trim();

  if (itemName.length < 2 || itemName.length > REPORT_ITEM_NAME_MAX) {
    errors.itemName = `Enter the item name (2–${REPORT_ITEM_NAME_MAX} characters).`;
  }
  if (!values.category) errors.category = "Choose a category.";
  if (description.length < REPORT_DESCRIPTION_MIN || description.length > REPORT_DESCRIPTION_MAX) {
    errors.description = `Describe the item (${REPORT_DESCRIPTION_MIN}–${REPORT_DESCRIPTION_MAX} characters).`;
  }
  if (location.length < 2 || location.length > REPORT_LOCATION_MAX) {
    errors.location = `Enter the location (2–${REPORT_LOCATION_MAX} characters).`;
  }

  const date = values.date.trim();
  const parsed = date ? new Date(`${date}T00:00:00.000Z`) : null;
  const validCalendarDate = !!parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  if (!validCalendarDate) errors.date = "Choose a valid date.";
  else if (date > localToday(now)) errors.date = "The date cannot be in the future.";

  return errors;
}
