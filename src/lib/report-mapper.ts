// Shared mapping between `Report` records and the student/admin report cards.
import { toDateOnly } from "./item-mapper";

export type ReportType = "LOST" | "FOUND";
export type ReportStatus = "PENDING" | "MATCHED" | "VERIFIED" | "REJECTED" | "CLOSED";

export interface ReportItemSummary {
  id: string;
  name: string;
  status: string;
  imageUrl: string | null;
  locker: string | null;
}

export interface UserReport {
  id: string;
  reference: string;
  type: ReportType;
  typeLabel: string;
  itemName: string;
  category: string;
  description: string;
  location: string;
  date: string;
  imageUrl: string | null;
  images: string[];
  status: ReportStatus;
  statusLabel: string;
  color: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  studentName: string;
  studentId: string;
  studentEmail: string;
  item: ReportItemSummary | null;
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  PENDING: "Pending",
  MATCHED: "Item matched",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export const REPORT_STATUS_COLOR: Record<ReportStatus, string> = {
  PENDING: "#64748b",
  MATCHED: "#7FB8B5",
  VERIFIED: "#16a34a",
  REJECTED: "#dc2626",
  CLOSED: "#355C8A",
};

export function reportStatusLabel(type: ReportType, status: ReportStatus): string {
  if (type === "FOUND" && status === "PENDING") return "Awaiting verification";
  return STATUS_LABEL[status] || "Pending";
}

export function shortReportReference(id: string): string {
  if (!id) return "—";
  const tail = id.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  return `RPT-${tail}`;
}

export function mapReport(raw: any): UserReport {
  const type = (raw?.type || "LOST") as ReportType;
  const status = (raw?.status || "PENDING") as ReportStatus;
  const images: string[] =
    Array.isArray(raw?.imageUrls) && raw.imageUrls.length
      ? raw.imageUrls.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : raw?.imageUrl
        ? [raw.imageUrl]
        : [];
  const item = raw?.item
    ? {
        id: String(raw.item.id ?? ""),
        name: raw.item.itemName || "Unknown item",
        status: raw.item.status || "FOUND",
        imageUrl: raw.item.imageUrl || null,
        locker: raw.item.locker?.lockerNumber || null,
      }
    : null;

  return {
    id: String(raw?.id ?? ""),
    reference: shortReportReference(String(raw?.id ?? "")),
    type,
    typeLabel: type === "LOST" ? "Lost" : "Found",
    itemName: raw?.itemName || "Unknown item",
    category: raw?.category || "Others",
    description: raw?.description || "",
    location: raw?.location || "",
    date: toDateOnly(raw?.date),
    imageUrl: images[0] || null,
    images,
    status,
    statusLabel: reportStatusLabel(type, status),
    color: REPORT_STATUS_COLOR[status] || REPORT_STATUS_COLOR.PENDING,
    adminNote: raw?.adminNote || null,
    createdAt: raw?.createdAt ? String(raw.createdAt) : "",
    reviewedAt: raw?.reviewedAt ? String(raw.reviewedAt) : null,
    studentName: raw?.user?.name || "Unknown student",
    studentId: raw?.user?.studentId || "",
    studentEmail: raw?.user?.email || "",
    item,
  };
}
