"use client";

import { Loader2, PackageSearch, RefreshCw, Sparkles } from "lucide-react";
import { formatDisplayDate } from "@/lib/date-format";
import type { ReportSuggestion } from "@/lib/report-suggestions";
import { VBadge, VButton, VCard, vcolors as c } from "@/components/ui/vault";

export interface ReportMatchesPanelProps {
  suggestions: ReportSuggestion[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onStartClaim: (suggestion: ReportSuggestion) => void;
  onViewDetails: (suggestion: ReportSuggestion) => void;
}

/** Possible inventory matches shown after a lost report is submitted or reopened. */
export function ReportMatchesPanel({ suggestions, loading, error, onRetry, onStartClaim, onViewDetails }: ReportMatchesPanelProps) {
  return (
    <VCard className="p-5 lg:p-6 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: c.text }}>
            <Sparkles size={16} style={{ color: c.primary }} />
            Possible matches
          </h3>
          <p className="text-xs mt-1" style={{ color: c.textMuted }}>
            Based on your item name, identifying details, category, date, and location. Similarity scores are not ownership probabilities.
          </p>
        </div>
        {!loading && !error && suggestions.length > 0 && (
          <VBadge color={c.primary}>{suggestions.length} found</VBadge>
        )}
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
            Your report stays pending. We&apos;ll notify you if a matching item is added to the inventory.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 mt-4">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id}
              className="rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ borderColor: c.borderLight, backgroundColor: c.card }}>
              {suggestion.imageUrl ? (
                <img src={suggestion.imageUrl} alt={suggestion.itemName}
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
                    {suggestion.label} similarity · {suggestion.score}/100
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
              <div className="flex items-center gap-2 shrink-0">
                <VButton size="sm" onClick={() => onStartClaim(suggestion)}>
                  Start claim
                </VButton>
                <VButton variant="secondary" size="sm" onClick={() => onViewDetails(suggestion)}>
                  View item details
                </VButton>
              </div>
            </div>
          ))}
          <p className="text-[11px] leading-relaxed pt-1" style={{ color: c.textLight }}>
            Review the item before claiming. Claiming opens the normal evidence form and links this lost report.
          </p>
        </div>
      )}
    </VCard>
  );
}
