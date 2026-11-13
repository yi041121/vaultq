"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface PhotoViewerModalProps {
  photos: string[];
  index: number;
  title?: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Full-size photo viewer with keyboard and thumbnail navigation. */
export function PhotoViewerModal({ photos, index, title, onIndexChange, onClose }: PhotoViewerModalProps) {
  const total = photos.length;
  const current = photos[Math.min(index, total - 1)];

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (total < 2) return;
      if (event.key === "ArrowRight") onIndexChange((index + 1) % total);
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + total) % total);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, total, onClose, onIndexChange]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex flex-col bg-black/90 backdrop-blur-md p-4"
      style={{ backgroundColor: "rgba(2,6,23,0.9)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} photo` : "Photo viewer"}>
      <div className="flex items-center justify-between gap-3 text-white mb-2">
        <p className="text-sm font-medium truncate">{title}</p>
        <div className="flex items-center gap-3 shrink-0">
          {total > 1 && <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{index + 1} / {total}</span>}
          <button type="button" onClick={onClose} aria-label="Close photo viewer"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 cursor-pointer transition-colors duration-150">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center" onClick={onClose}>
        <img src={current} alt={title ? `${title} photo ${index + 1}` : `Photo ${index + 1}`}
          className="max-h-full max-w-full object-contain rounded-lg"
          onClick={(event) => event.stopPropagation()} />

        {total > 1 && (
          <>
            <button type="button" aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 text-white cursor-pointer transition-colors duration-150"
              onClick={(event) => { event.stopPropagation(); onIndexChange((index - 1 + total) % total); }}>
              <ChevronLeft size={20} />
            </button>
            <button type="button" aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 text-white cursor-pointer transition-colors duration-150"
              onClick={(event) => { event.stopPropagation(); onIndexChange((index + 1) % total); }}>
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {photos.map((photo, photoIndex) => (
            <button key={`viewer-thumb-${photoIndex}`} type="button"
              aria-label={`View photo ${photoIndex + 1}`}
              className="w-14 h-14 rounded-lg overflow-hidden border-2 cursor-pointer transition-opacity duration-150"
              style={{ borderColor: photoIndex === index ? "#7FB8B5" : "transparent", opacity: photoIndex === index ? 1 : 0.6 }}
              onClick={() => onIndexChange(photoIndex)}>
              <img src={photo} alt={`Thumbnail ${photoIndex + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
