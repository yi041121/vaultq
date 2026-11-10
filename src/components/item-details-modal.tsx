"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, Package, X, Eye } from "lucide-react";
import { VCard, VBadge, vcolors as c } from "@/components/ui/vault";
import { categoryIcon } from "@/lib/category-icons";

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

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <VCard className={`relative w-full ${maxWidth} max-h-[90vh] overflow-auto`}>
        <div className="w-full h-64 lg:h-72 rounded-t-2xl flex items-center justify-center relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}>
          {hasPhotos ? (
            <>
              {onViewPhoto ? (
                <button type="button"
                  aria-label={`View ${title} photo`}
                  className="absolute inset-0 group cursor-pointer"
                  onClick={onViewPhoto}>
                  <img src={photos[safeIndex]} alt={title} className="w-full h-full object-cover bg-[#f8fafc]" />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                      <Eye size={13} /> View photo
                    </span>
                  </span>
                </button>
              ) : (
                <img src={photos[safeIndex]} alt={title} className="w-full h-full object-cover bg-[#f8fafc]" />
              )}
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
              <Package size={48} style={{ color: c.primary, opacity: 0.6 }} />
            </>
          )}
          <button type="button" onClick={onClose} aria-label="Close details"
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-transparent flex items-center justify-center hover:bg-black/25 transition-colors duration-200 cursor-pointer"
            style={{ color: hasPhotos ? "#fff" : c.textMuted, filter: hasPhotos ? "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" : undefined }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-base font-semibold" style={{ color: c.text }}>{title}</h3>
            {statusLabel && <VBadge color={statusColor}>{statusLabel}</VBadge>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs" style={{ color: c.textMuted }}>
            <span className="flex items-center gap-1">
              <CatIcon size={12} style={{ color: c.primary }} /> {category}
            </span>
            <span className="flex items-center gap-1"><MapPin size={12} /> {location || "—"}</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {date || "—"}</span>
            {extra}
          </div>

          <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: c.fill }}>
            <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>Description</p>
            <p className="text-sm leading-relaxed" style={{ color: c.textMuted }}>{description || "No description provided."}</p>
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
    </div>
  );
}
