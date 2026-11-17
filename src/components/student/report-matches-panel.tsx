"use client";

import type { RefObject } from "react";
import { Loader2, PackageSearch, RefreshCw, Sparkles, X } from "lucide-react";
import { formatDisplayDate } from "@/lib/date-format";
import type { ReportSuggestion } from "@/lib/report-suggestions";
import { VButton, VCard, vcolors as c } from "@/components/ui/vault";

export interface ReportMatchesPanelProps {
  suggestions: ReportSuggestion[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onStartClaim: (suggestion: ReportSuggestion) => void;
  onViewDetails: (suggestion: ReportSuggestion) => void;
  /** Overrides the panel heading, e.g. "Matches for backpack". */
  title?: string;
  onClose?: () => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

/** Possible inventory matches shown after a lost report is submitted or reopened. */
export function ReportMatchesPanel({
  suggestions, loading, error, onRetry, onStartClaim, onViewDetails, title, onClose, headingRef,
}: ReportMatchesPanelProps) {
  return (
    <VCard className="min-w-0 p-5 lg:p-6 text-left [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-40">
          <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined}
            className="text-base font-semibold flex items-center gap-2" style={{ color: c.text }}>
            <Sparkles size={16} className="shrink-0" style={{ color: c.primary }} />
            {title ?? "Possible matches"}
          </h2>
          <p className="text-xs mt-1" style={{ color: c.textMuted }}>
            Similarity is a hint, not proof of ownership.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close matches"
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: c.primarySoft, color: c.primary }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border px-4 py-8 text-center" style={{ borderColor: c.borderLight }}>
          <Loader2 size={22} className="animate-spin mx-auto mb-2" style={{ color: c.primary }} />
          <p className="text-xs" style={{ color: c.textMuted }}>Checking the inventory...</p>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border px-4 py-6 text-center" style={{ borderColor: c.borderLight, backgroundColor: c.fill }}>
          <p className="text-sm font-medium" style={{ color: c.textMuted }}>Could not check matches right now</p>
          <p className="text-xs mt-1 mb-3" style={{ color: c.textLight }}>{error}</p>
          <VButton variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw size={13} /> Try again
          </VButton>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="mt-4 rounded-xl border px-4 py-7 text-center" style={{ borderColor: c.borderLight, backgroundColor: c.fill }}>
          <PackageSearch size={28} className="mx-auto mb-2" style={{ color: c.textLight }} />
          <p className="text-sm font-medium" style={{ color: c.textMuted }}>No close matches yet</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: c.textLight }}>
            Your report stays pending. We&apos;ll notify you if a matching item appears.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 mt-4">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id}
              className="rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ borderColor: c.borderLight, backgroundColor: c.card }}>
              {suggestion.imageUrl ? (
                <img src={suggestion.imageUrl} alt={suggestion.itemName} loading="lazy" decoding="async"
                  className="w-full sm:w-14 h-32 sm:h-14 rounded-lg object-contain shrink-0" />
              ) : (
                <div className="w-full sm:w-14 h-20 sm:h-14 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: c.fill }}>
                  <PackageSearch size={20} style={{ color: c.primary }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: c.text }}>{suggestion.itemName}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={suggestion.score >= 70
                      ? { backgroundColor: "#dcfce7", color: "#15803d" }
                      : suggestion.score >= 50
                        ? { backgroundColor: "#dbeafe", color: "#1d4ed8" }
                        : { backgroundColor: c.fill, color: c.textMuted }}>
                    {suggestion.label} · {suggestion.score}/100
                  </span>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: c.textMuted }}>
                  {suggestion.category || "Others"} · <time className="vq-date">{formatDisplayDate(suggestion.foundDate || "")}</time>
                  {suggestion.foundLocation ? ` · ${suggestion.foundLocation}` : ""}
                </p>
                {suggestion.reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {suggestion.reasons.map((reason) => (
                      <span key={reason} className="text-[10px] px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: c.fill, color: c.textMuted }}>
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                <VButton size="sm" className="min-w-[5.25rem] flex-1 sm:flex-none" onClick={() => onStartClaim(suggestion)}>
                  Start claim
                </VButton>
                <VButton variant="secondary" size="sm" className="min-w-[7.5rem] flex-1 sm:flex-none" onClick={() => onViewDetails(suggestion)}>
                  View item details
                </VButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </VCard>
  );
}
