import { formatDisplayDate } from "./date-format";

export function lostReportClaimReason(report: {
  itemName: string; category: string; date: string; location: string; description: string;
}): string {
  return [
    `Item: ${report.itemName}`,
    `Category: ${report.category || "Others"}`,
    `Lost on: ${formatDisplayDate(report.date)}`,
    `Lost at: ${report.location || "Not specified"}`,
    `Description: ${report.description || "Not provided"}`,
  ].join("\n");
}
