import { formatDisplayDate } from "./date-format";

/**
 * One-sentence claim reason used when a lost report is linked to a found item.
 * Kept to a single, predictable format so students only add details instead of
 * rewriting a block of labels.
 */
export function lostReportClaimReason(report: {
  itemName: string; category: string; date: string; location: string; description: string;
}): string {
  const details = (report.description || "no extra details").trim().replace(/[.!?]+$/, "");
  return `I lost my ${report.itemName} (${report.category || "Others"}) at ${report.location || "campus"} on ${formatDisplayDate(report.date)}; identifying details: ${details}.`;
}
