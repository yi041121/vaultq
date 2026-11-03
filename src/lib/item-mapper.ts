// Shared mapping between the database `Item` records and the student-facing
// item cards. The API returns Prisma field names (itemName, foundLocation,
// foundDate, …) while the UI uses simpler names.

export type ItemStatus = "FOUND" | "CLAIMED" | "RETRIEVED" | "EXPIRED";

export interface FoundItem {
  id: string;
  name: string;
  category: string;
  description: string;
  location: string;
  date: string; // yyyy-mm-dd
  status: ItemStatus;
  statusLabel: string;
  color: string;
  imageUrl: string | null;
  locker: string | null;
  reportedByMe: boolean;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  FOUND: "Found",
  CLAIMED: "Claimed",
  RETRIEVED: "Retrieved",
  EXPIRED: "Expired",
};

const STATUS_COLOR: Record<ItemStatus, string> = {
  FOUND: "#7FB8B5",
  CLAIMED: "#355C8A",
  RETRIEVED: "#16a34a",
  EXPIRED: "#dc2626",
};

/** Safely converts an ISO date / Date to a yyyy-mm-dd string. */
export function toDateOnly(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function mapApiItem(raw: any): FoundItem {
  const status = (raw?.status || "FOUND") as ItemStatus;
  return {
    id: String(raw?.id ?? ""),
    name: raw?.itemName || "Unknown item",
    category: raw?.category || "Others",
    description: raw?.description || "",
    location: raw?.foundLocation || "",
    date: toDateOnly(raw?.foundDate ?? raw?.createdAt),
    status,
    statusLabel: STATUS_LABEL[status] || "Found",
    color: STATUS_COLOR[status] || STATUS_COLOR.FOUND,
    imageUrl: raw?.imageUrl || null,
    locker: raw?.locker?.lockerNumber || null,
    reportedByMe: Array.isArray(raw?.reports) && raw.reports.length > 0,
  };
}
