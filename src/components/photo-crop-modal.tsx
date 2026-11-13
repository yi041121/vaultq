"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Crop, Loader2, X } from "lucide-react";
import "react-easy-crop/react-easy-crop.css";
import { useEscapeKey } from "@/lib/use-escape-key";
import { vcolors as c } from "@/components/ui/vault";
import { compressImageFile } from "@/lib/image-compression";

interface PhotoCropModalProps {
  src: string;
  onClose: () => void;
  onSave: (photo: { file: File; preview: string }) => void;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = src;
  });
}

async function cropPhoto(src: string, area: Area) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not crop image");
  ctx.drawImage(
    image,
    Math.round(area.x),
    Math.round(area.y),
    Math.round(area.width),
    Math.round(area.height),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Could not crop image");
  const file = new File([blob], `report-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
  const compressed = await compressImageFile(file);
  return { file: compressed.file, preview: compressed.preview };
}

/** Large photo preview with a square crop area. */
export function PhotoCropModal({ src, onClose, onSave }: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEscapeKey(true, onClose, !saving);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setArea(croppedAreaPixels);
  }, []);

  async function handleSave() {
    if (!area || saving) return;
    setSaving(true);
    try {
      onSave(await cropPhoto(src, area));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { if (!saving) onClose(); }} />
      <div className="relative w-full max-w-xl rounded-2xl border bg-white p-5" style={{ borderColor: c.border }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold" style={{ color: c.text }}>View &amp; crop photo</h3>
            <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>Drag the photo to position it, then use the slider to zoom.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0 disabled:opacity-50"
            style={{ color: c.textMuted }} aria-label="Close photo editor">
            <X size={16} />
          </button>
        </div>

        <div className="relative w-full h-[340px] rounded-xl overflow-hidden" style={{ backgroundColor: "#0f172a" }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
          />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-xs font-medium shrink-0" style={{ color: c.textMuted }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 cursor-pointer accent-[#355C8A]"
            aria-label="Photo zoom"
          />
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="h-10 px-4 rounded-xl text-sm font-medium border bg-white cursor-pointer disabled:opacity-50"
              style={{ borderColor: c.border, color: c.textMuted }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !area}
              className="h-10 px-4 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: c.primary }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Crop size={14} />}
              {saving ? "Saving..." : "Save crop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
