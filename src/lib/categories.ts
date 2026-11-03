// Single source of truth for item categories used by forms, filters and APIs.
export const ITEM_CATEGORIES = [
  "Electronics",
  "Bags",
  "Student Cards",
  "Keys",
  "Documents",
  "Water Bottles",
  "Others",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export function isItemCategory(value: unknown): value is ItemCategory {
  return typeof value === "string" && (ITEM_CATEGORIES as readonly string[]).includes(value);
}
