"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, Package, X, Eye } from "lucide-react";
import { VCard, VBadge, vcolors as c } from "@/components/ui/vault";
import { categoryIcon } from "@/lib/category-icons";
import { PhotoViewerModal } from "@/components/photo-viewer-modal";
import { useEscapeKey } from "@/lib/use-escape-key";

export interface ItemDetailsModalProps {
  title: string;
  statusLabel?: string | null;
  statusColor?: string;
  category: string;
  location?: string | null;
  date?: string | null;
  description?: string | null;
  photos?: string[];
  photoIndex?: number;
  onPhotoIndexChange?: (index: number) => void;
  onViewPhoto?: () => void;
  onClose: () => void;
  extra?: ReactNode;
  footer?: ReactNode;
  footerNote?: ReactNode;
  maxWidth?: string;
  zIndex?: string;
}

/**
 * Shared "view details" modal so item cards look the same across the admin and
 * student dashboards: photo header with slider, title + status, category /
 * location / date row, description, then the caller's footer actions.
 */
export function ItemDetailsModal({
  title,
  statusLabel,
  statusColor = c.primary,
  category,
  location,
  date,
  description,
  photos = [],
  photoIndex = 0,
  onPhotoIndexChange,
  onViewPhoto,
  onClose,
  extra,
  footer,
  footerNote,
  maxWidth = "max-w-lg",
  zIndex = "z-50",
}: ItemDetailsModalProps) {
  const CatIcon = categoryIcon(category);
  const safeIndex = Math.min(Math.max(0, photoIndex), Math.max(0, photos.length - 1));
  const hasPhotos = photos.length > 0;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Pages that own an external viewer handle their own Escape flow. For the
  // standalone details modal, Escape closes the modal; while the full photo
  // viewer is open it consumes Escape first.
  useEscapeKey(!onViewPhoto && viewerIndex === null, onClose);
  useEffect(() => {
    if (viewerIndex === null) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setViewerIndex(null);
    }
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [viewerIndex]);

  const openPhoto = onViewPhoto ?? (() => setViewerIndex(safeIndex));

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={onClose} />
      <VCard role="dialog" aria-modal="true" aria-label={title} className={`relative w-full ${maxWidth} max-h-[90vh] overflow-auto`}>
        <div className={`w-full ${hasPhotos ? "h-64 lg:h-80" : "h-32 lg:h-36"} rounded-t-2xl flex items-center justify-center relative overflow-hidden`}
          style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}>
          {hasPhotos ? (
            <>
              <button type="button"
                aria-label={`View ${title} photo`}
                className="absolute inset-0 group cursor-pointer"
                onClick={openPhoto}>
                <img src={photos[safeIndex]} alt={title} className="w-full h-full object-contain" />
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                    <Eye size={13} /> View photo
                  </span>
                </span>
              </button>
              {photos.length > 1 && (
                <>
                  <button type="button" aria-label="Previous photo"
                    disabled={safeIndex === 0}
                    onClick={() => onPhotoIndexChange?.(Math.max(0, safeIndex - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white disabled:opacity-40 cursor-pointer transition-colors duration-150"
                    style={{ color: c.textMuted }}>
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" aria-label="Next photo"
                    disabled={safeIndex >= photos.length - 1}
                    onClick={() => onPhotoIndexChange?.(Math.min(photos.length - 1, safeIndex + 1))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white disabled:opacity-40 cursor-pointer transition-colors duration-150"
                    style={{ color: c.textMuted }}>
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
              <div className="relative flex flex-col items-center gap-2" style={{ color: c.textMuted }}>
                <Package size={32} style={{ color: c.primary }} />
                <p className="text-xs font-medium">No photo available</p>
              </div>
            </>
          )}
          <button type="button" onClick={onClose} aria-label="Close details"
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: c.primary, color: "#fff", boxShadow: "0 2px 8px rgba(15,23,42,0.28)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-lg lg:text-xl font-semibold leading-snug" style={{ color: c.text }}>{title}</h3>
            {statusLabel && <VBadge color={statusColor}>{statusLabel}</VBadge>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-5 text-sm" style={{ color: c.textMuted }}>
            <span className="flex items-center gap-1">
              {/* categoryIcon returns a stable icon from a static map. */}
              {/* eslint-disable-next-line react-hooks/static-components */}
              <CatIcon size={14} style={{ color: c.primary }} /> {category}
            </span>
            <span className="flex items-center gap-1"><MapPin size={14} /> {location || "—"}</span>
            <span className="vq-date flex items-center gap-1"><Clock size={14} /> {date || "—"}</span>
            {extra}
          </div>

          <div className="min-w-0 rounded-xl border p-4 mb-5" style={{ backgroundColor: c.fill, borderColor: c.border }}>
            <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>Description</p>
            <p className="text-sm leading-relaxed [overflow-wrap:anywhere]" style={{ color: c.textMuted }}>{description || "No description provided."}</p>
          </div>

          {(footer || footerNote) && (
            <div className="flex flex-wrap items-center gap-3">
              {footerNote && (
                <p className="text-[11px] mr-auto" style={{ color: c.textLight }}>{footerNote}</p>
              )}
              {footer}
            </div>
          )}
        </div>
      </VCard>
      {viewerIndex !== null && (
        <PhotoViewerModal
          photos={photos}
          index={viewerIndex}
          title={title}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
