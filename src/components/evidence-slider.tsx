"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { vcolors as c } from "@/components/ui/vault";

/** Read-only evidence gallery used by the claim review/details dialogs. */
export function EvidenceSlider({ photos, alt, caption, label = "evidence" }: {
  photos: string[];
  alt: string;
  caption?: string;
  label?: string;
}) {
  const [index, setIndex] = useState(0);
  const key = photos.join("|");

  useEffect(() => {
    setIndex(0);
  }, [key]);

  if (!photos.length) return null;
  const safe = Math.min(index, photos.length - 1);

  return (
    <div className="rounded-xl overflow-hidden border relative" style={{ borderColor: c.border }}>
      <div className="relative">
        <img src={photos[safe]} alt={alt} loading="lazy" decoding="async" className="w-full h-64 object-contain bg-[#f8fafc]" />
        {photos.length > 1 && (
          <>
            <button type="button" aria-label={`Previous ${label} photo`}
              disabled={safe === 0}
              onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 backdrop-blur flex items-center justify-center hover:bg-white disabled:opacity-40 cursor-pointer transition-colors duration-150"
              style={{ color: c.textMuted }}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label={`Next ${label} photo`}
              disabled={safe >= photos.length - 1}
              onClick={() => setIndex((prev) => Math.min(photos.length - 1, prev + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 backdrop-blur flex items-center justify-center hover:bg-white disabled:opacity-40 cursor-pointer transition-colors duration-150"
              style={{ color: c.textMuted }}>
              <ChevronRight size={16} />
            </button>
            <span className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: "rgba(15,23,42,0.65)" }}>
              {safe + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
      {caption && (
        <p className="text-[11px] text-center py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>{caption}</p>
      )}
    </div>
  );
}
