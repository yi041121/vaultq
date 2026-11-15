"use client";

import {
  CircleAlert, Eye, FileText, PackageCheck, Sparkles, ZoomIn,
} from "lucide-react";
import { formatDisplayDate, formatDisplayTimestamp } from "@/lib/date-format";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import type { UserReport } from "@/lib/report-mapper";
import { reportNextStep } from "@/lib/student-workflow";
import { VBadge, VButton, VCard, vcolors as c } from "@/components/ui/vault";

const FOUND_COLOR = "#4a9d6b";
const reportTypeColor = (type: UserReport["type"]) => (type === "LOST" ? "#355C8A" : FOUND_COLOR);

// Logged item statuses shown inside a report card. Once the report itself is
// VERIFIED the card shows "Verified" instead, matching the badge at the top.
const itemStatusLabel: Record<string, string> = {
  FOUND: "Found",
  CLAIMED: "Claimed",
  RETRIEVED: "Retrieved",
  EXPIRED: "Expired",
};

function fmtReportTime(value: string | null) {
  if (!value) return "";
  const formatted = formatDisplayTimestamp(value);
  return formatted === "—" ? "" : formatted;
}

function fmtDate(value: string | null) {
  return formatDisplayDate(value);
}

export interface ReportCardProps {
  report: UserReport;
  onViewPhotos: (report: UserReport) => void;
  onViewReport: (report: UserReport) => void;
  onViewItem: (report: UserReport) => void;
  onEdit: (report: UserReport) => void;
  onWithdraw: (report: UserReport) => void;
  onCheckMatches: (report: UserReport) => void;
  onViewClaims: () => void;
}

/** One card in My Reports. Presentational only; actions are page callbacks. */
export function ReportCard({
  report, onViewPhotos, onViewReport, onViewItem, onEdit, onWithdraw, onCheckMatches, onViewClaims,
}: ReportCardProps) {
  const Icon = CATEGORY_ICONS[report.category] || FileText;
  const verifiedWithItem = report.status === "VERIFIED" && !!report.item;
  const matchedWithItem = report.status === "MATCHED" && !!report.item;
  const linkedWithItem = matchedWithItem;
  const rejected = report.status === "REJECTED";
  // Verified, linked and rejected reports share the compact "item first"
  // layout; only the thumbnail source differs.
  const showsItemFirst = verifiedWithItem || linkedWithItem || rejected;
  const itemName = report.item?.name || report.itemName;
  // Linked/rejected cards show the student's uploaded photo.
  const itemThumb = linkedWithItem || rejected
    ? report.images[0] || report.item?.imageUrl
    : report.item?.imageUrl;

  const itemBlock = (report.item || rejected) && (
    <div className="rounded-xl p-3.5 mb-3 flex flex-wrap items-center gap-3" style={{ backgroundColor: c.fill }}>
      <button
        type="button"
        aria-label={linkedWithItem || rejected ? `View your ${report.itemName} photos` : `View ${itemName} details`}
        className="group flex flex-1 min-w-[160px] items-center gap-3 text-left cursor-pointer"
        onClick={() => {
          if (linkedWithItem || rejected) onViewPhotos(report);
          else onViewItem(report);
        }}>
        {itemThumb ? (
          <span className="relative rounded-lg overflow-hidden border shrink-0 block" style={{ borderColor: c.border }}>
            <img src={itemThumb} alt={itemName} className="w-12 h-12 object-contain" />
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors duration-200 flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white">
                <ZoomIn size={14} />
              </span>
            </span>
          </span>
        ) : (
          <span className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: c.borderLight }}>
            <PackageCheck size={20} style={{ color: c.primary }} />
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-semibold" style={{ color: c.text }}>
            {linkedWithItem
              ? `Lost reporting: ${report.itemName}`
              : rejected
                ? `${report.type === "LOST" ? "Lost" : "Found"} report: ${report.itemName}`
                : `${report.type === "LOST" ? "Matched item" : "Logged item"}: ${report.item?.name}`}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {(report.status === "VERIFIED" || report.status === "MATCHED" || rejected) && (
              <VBadge color={reportTypeColor(report.type)}
                style={{ backgroundColor: "transparent", border: "1px solid currentColor" }}>
                {report.typeLabel}
              </VBadge>
            )}
            {report.status === "VERIFIED" || report.status === "MATCHED" || rejected ? (
              <VBadge color={report.color}>{report.statusLabel}</VBadge>
            ) : (
              <span className="text-[11px]" style={{ color: c.textMuted }}>
                {report.item ? itemStatusLabel[report.item.status] || report.item.status : ""}
              </span>
            )}
          </span>
        </span>
      </button>
      {linkedWithItem && (
        <VButton variant="secondary" size="sm" onClick={() => onViewItem(report)}>
          <PackageCheck size={13} /> {matchedWithItem ? "Matched item" : "Item details"}
        </VButton>
      )}
      <VButton variant="secondary" size="sm" onClick={() => (linkedWithItem || rejected ? onViewReport(report) : onViewItem(report))}>
        <Eye size={13} /> View
      </VButton>
    </div>
  );

  return (
    <VCard className="p-5 lg:p-6 flex flex-col">
      {showsItemFirst && itemBlock}
      {!showsItemFirst && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 -mt-0.5"
              style={{ backgroundColor: c.primary }}>
              <Icon size={18} style={{ color: "#fff" }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{report.itemName}</h3>
              <p className="text-[11px] mt-0.5" style={{ color: c.textLight }}>
                <time className="vq-date">{fmtDate(report.date)}</time>{" · "}{report.location || "—"}{" · "}{report.category}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <VBadge color={reportTypeColor(report.type)}
              style={{ backgroundColor: "transparent", border: "1px solid currentColor" }}>
              {report.typeLabel}
            </VBadge>
            {/* A verified report shows its badge on the logged item below, so hide the duplicate here. */}
            {!showsItemFirst && (
              <VBadge color={report.color}>{report.statusLabel}</VBadge>
            )}
          </div>
        </div>
      )}
      {/* The details popup already shows the description for verified reports. */}
      {!showsItemFirst && (
        <div className="rounded-xl border p-3 mb-3" style={{ borderColor: c.borderLight, backgroundColor: c.fill }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: c.textLight }}>Description</p>
          <p className="text-sm leading-relaxed line-clamp-3" style={{ color: c.textMuted }}>{report.description}</p>
        </div>
      )}

      {/* Same photo block as admin verification: one bordered preview with a
          count badge; the viewer shows the rest. */}
      {report.images.length > 0 && !showsItemFirst && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold mb-1.5" style={{ color: c.textLight }}>Report photos</p>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
            <button type="button"
              aria-label={`View ${report.itemName} report photo`}
              className="relative block w-full h-[240px] xl:h-[260px] group cursor-pointer"
              style={{ backgroundColor: c.fill }}
              onClick={() => onViewPhotos(report)}>
              <img src={report.images[0]} alt={`${report.itemName} report photo`}
                loading="lazy" decoding="async" className="block w-full h-full object-contain" />
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-150 flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                  <ZoomIn size={12} /> View photo
                </span>
              </span>
              {report.images.length > 1 && (
                <span className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5">
                  {report.images.length} photos
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {report.adminNote && (
        <div role="note" className="mb-3 flex gap-2 rounded-xl border p-3 text-xs leading-relaxed"
          style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }}>
          <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span><span className="font-semibold">Admin note: </span>{report.adminNote}</span>
        </div>
      )}

      {(showsItemFirst || linkedWithItem) && report.reviewedAt && (
        <p className="text-[11px] text-right mt-3" style={{ color: c.textLight }}>
          {report.status === "MATCHED" ? "Matched" : report.status === "REJECTED" ? "Rejected" : "Verified"} by admin · <time className="vq-date">{fmtReportTime(report.reviewedAt)}</time>
        </p>
      )}

      {!showsItemFirst && itemBlock}

      <p className="mb-3 rounded-xl p-3 text-xs leading-relaxed" style={{ backgroundColor: c.primarySoft, color: c.textMuted }}>
        {reportNextStep(report.type, report.status)}
      </p>

      <p className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: c.textLight }}>
        Reference <span className="font-mono normal-case tracking-normal">{report.reference}</span>
      </p>

      {report.type === "LOST" && report.status === "PENDING" && !report.item && (
        <VButton className="mb-3 w-full" size="sm" onClick={() => onCheckMatches(report)}>
          <Sparkles size={14} /> Check possible matches
        </VButton>
      )}

      {report.type === "LOST" && (report.status === "MATCHED" || report.status === "CLOSED") && (
        <VButton variant="secondary" className="mb-3 w-full" size="sm" onClick={onViewClaims}>
          View my claims
        </VButton>
      )}

      {report.type === "FOUND" && report.status === "PENDING" && (
        <div className="rounded-xl p-3.5 mb-3 text-xs leading-relaxed flex gap-2" style={{ backgroundColor: `color-mix(in srgb, ${c.accent} 7%, transparent)`, color: c.textMuted }}>
          <PackageCheck size={16} className="shrink-0 mt-0.5" style={{ color: c.accent }} />
          <span>Please hand this item to the Lost &amp; Found office. An admin will verify it and assign a locker.</span>
        </div>
      )}

      {report.status === "PENDING" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <VButton variant="secondary" size="sm" onClick={() => onEdit(report)}>
            Edit
          </VButton>
          <VButton variant="danger" size="sm" onClick={() => onWithdraw(report)}>
            Withdraw
          </VButton>
        </div>
      )}
    </VCard>
  );
}

export { itemStatusLabel };
