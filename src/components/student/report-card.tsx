"use client";

import { CircleAlert, Eye, FileText, Sparkles } from "lucide-react";
import { formatDisplayDate, formatDisplayTimestamp } from "@/lib/date-format";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import type { UserReport } from "@/lib/report-mapper";
import { VBadge, VButton, VCard, vcolors as c } from "@/components/ui/vault";

const FOUND_COLOR = "#4a9d6b";
const reportTypeColor = (type: UserReport["type"]) => (type === "LOST" ? "#355C8A" : FOUND_COLOR);

function fmtDate(value: string | null) {
  return formatDisplayDate(value);
}

function fmtReviewed(value: string | null) {
  if (!value) return "";
  const formatted = formatDisplayTimestamp(value);
  return formatted === "—" ? "" : formatted;
}

export interface ReportCardProps {
  report: UserReport;
  onViewReport: (report: UserReport) => void;
  onCheckMatches: (report: UserReport) => void;
  onViewClaims: () => void;
}

/**
 * One card in My Reports.
 *
 * A glance is enough to recognise the report: photo, item, when/where,
 * category, status and a two-line description. Reference, photo gallery,
 * admin guidance and the edit/withdraw actions live in "View details", so
 * every card keeps the same shape in a mixed lost/found grid.
 */
export function ReportCard({ report, onViewReport, onCheckMatches, onViewClaims }: ReportCardProps) {
  const Icon = CATEGORY_ICONS[report.category] || FileText;
  const thumb = report.images[0] || report.item?.imageUrl || null;
  const pending = report.status === "PENDING";

  return (
    <VCard className="p-4 lg:p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {thumb ? (
            <img src={thumb} alt={`${report.itemName} photo`} loading="lazy" decoding="async"
              className="h-10 w-10 shrink-0 rounded-lg border object-contain"
              style={{ borderColor: c.border, backgroundColor: c.fill }} />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: c.primary }}>
              <Icon size={17} style={{ color: "#fff" }} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold" style={{ color: c.text }}>{report.itemName}</h3>
            <p className="mt-0.5 truncate text-[11px]" style={{ color: c.textLight }}>
              <time className="vq-date">{fmtDate(report.date)}</time>{" · "}{report.location || "—"}{" · "}{report.category}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <VBadge color={reportTypeColor(report.type)}
            style={{ backgroundColor: "transparent", border: "1px solid currentColor" }}>
            {report.typeLabel}
          </VBadge>
          <VBadge color={report.color}>{report.statusLabel}</VBadge>
        </div>
      </div>

      <div className="mt-3 rounded-xl border px-3 py-2.5"
        style={{ borderColor: c.border, backgroundColor: c.fill }}>
        <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: c.textMuted }}>
          {report.description}
        </p>
      </div>

      {/* An admin note is the one extra block that stays on the card. */}
      {report.adminNote && (
        <div role="note" className="mt-3 flex gap-2 rounded-lg border p-2.5 text-[11px] leading-relaxed"
          style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }}>
          <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span><span className="font-semibold">Admin note: </span>{report.adminNote}</span>
        </div>
      )}

      {/* Reviewer label/date on the left; actions on the right. */}
      <div className="mt-3 flex items-center gap-3">
        {report.reviewedAt && (
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-snug" style={{ color: c.textLight }}>Reviewed by admin</p>
            <p className="text-[11px] leading-snug" style={{ color: c.textMuted }}>
              <time className="vq-date">{fmtReviewed(report.reviewedAt)}</time>
            </p>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {report.type === "LOST" && pending && !report.item && (
            <VButton size="sm" onClick={() => onCheckMatches(report)}>
              <Sparkles size={13} /> Check matches
            </VButton>
          )}
          {report.type === "LOST" && (report.status === "MATCHED" || report.status === "CLOSED") && (
            <VButton variant="secondary" size="sm" onClick={onViewClaims}>
              My claims
            </VButton>
          )}
          <VButton variant="secondary" size="sm" onClick={() => onViewReport(report)}>
            <Eye size={13} /> View details
          </VButton>
        </div>
      </div>
    </VCard>
  );
}
