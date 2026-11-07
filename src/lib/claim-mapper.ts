// Shared mapping for student claims. The database status is only
// PENDING / APPROVED / REJECTED; the UI derives "QR Ready" and "Collected"
// from the QR code and the linked item state.

import { toDateOnly } from "./item-mapper";

export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ClaimDisplayStatus = "Pending" | "Approved" | "QR Ready" | "Collected" | "Rejected";

export interface UserClaim {
  id: string;
  reference: string;
  itemId: string;
  itemName: string;
  category: string;
  description: string;
  location: string;
  foundDate: string;
  claimedAt: string;
  approvedAt: string | null;
  status: ClaimStatus;
  displayStatus: ClaimDisplayStatus;
  locker: string | null;
  reason: string;
  evidenceImageUrl: string | null;
  evidenceImageUrls: string[];
  evidenceUploadedAt: string;
  adminNote: string | null;
  lostReportDescription: string | null;
  itemImageUrl: string | null;
  itemImageUrls: string[];
  itemStatus: string;
  itemCreatedAt: string;
  hasValidQr: boolean;
}

/** Short, human-readable claim reference, e.g. CLM-3F9A1B2C. */
export function shortClaimReference(id: string): string {
  if (!id) return "—";
  const tail = id.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  return `CLM-${tail}`;
}

export function mapUserClaim(raw: any): UserClaim {
  const qr = raw?.qrCode;
  const hasValidQr = !!(qr && !qr.isUsed && new Date(qr.expiresAt).getTime() > Date.now());

  let displayStatus: ClaimDisplayStatus = "Pending";
  if (raw?.status === "REJECTED") {
    displayStatus = "Rejected";
  } else if (raw?.status === "APPROVED") {
    if (raw?.item?.status === "RETRIEVED") displayStatus = "Collected";
    else if (hasValidQr) displayStatus = "QR Ready";
    else displayStatus = "Approved";
  }

  return {
    id: String(raw?.id ?? ""),
    reference: shortClaimReference(String(raw?.id ?? "")),
    itemId: String(raw?.itemId ?? raw?.item?.id ?? ""),
    itemName: raw?.item?.itemName || "Unknown item",
    category: raw?.item?.category || "Others",
    description: raw?.item?.description || "",
    location: raw?.item?.foundLocation || "",
    foundDate: toDateOnly(raw?.item?.foundDate),
    claimedAt: raw?.createdAt ? String(raw.createdAt) : "",
    approvedAt: raw?.approvedAt ? String(raw.approvedAt) : null,
    status: (raw?.status || "PENDING") as ClaimStatus,
    displayStatus,
    // Defense in depth: never surface the locker on an unapproved claim.
    locker:
      raw?.status === "APPROVED"
        ? raw?.item?.locker?.lockerNumber || null
        : null,
    reason: raw?.claimReason || "",
    evidenceImageUrl: raw?.evidenceImageUrl || null,
    evidenceImageUrls: Array.isArray(raw?.evidenceImageUrls) && raw.evidenceImageUrls.length
      ? raw.evidenceImageUrls.filter((value: unknown): value is string => typeof value === "string")
      : raw?.evidenceImageUrl
        ? [raw.evidenceImageUrl]
        : [],
    evidenceUploadedAt: raw?.evidenceUploadedAt ? String(raw.evidenceUploadedAt) : raw?.createdAt ? String(raw.createdAt) : "",
    adminNote: raw?.adminNote || null,
    lostReportDescription: raw?.matchedReportDescription || null,
    itemImageUrl: raw?.item?.imageUrl || null,
    itemImageUrls: Array.from(new Set([
      raw?.item?.imageUrl,
      ...(Array.isArray(raw?.item?.reports)
        ? raw.item.reports.flatMap((r: any) => (Array.isArray(r.imageUrls) ? r.imageUrls : []))
        : []),
    ].filter((value: unknown): value is string => typeof value === "string" && value.length > 0))),
    itemStatus: raw?.item?.status || "",
    itemCreatedAt: raw?.item?.createdAt ? String(raw.item.createdAt) : "",
    hasValidQr,
  };
}

export const CLAIM_STATUS_COLOR: Record<ClaimDisplayStatus, string> = {
  Pending: "#64748b",
  Approved: "#7FB8B5",
  "QR Ready": "#29486A",
  Collected: "#16a34a",
  Rejected: "#dc2626",
};
