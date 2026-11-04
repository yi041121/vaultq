"use client";

import { Camera, Upload } from "lucide-react";
import { vcolors as c } from "@/components/ui/vault";

interface PhotoPickerProps {
  onUpload: () => void;
  onTakePhoto: () => void;
}

/** Large Upload / Take Photo cards shown when a report has no photos yet. */
export function PhotoPicker({ onUpload, onTakePhoto }: PhotoPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button"
        className="flex flex-col items-center justify-center gap-1.5 h-28 rounded-xl border border-dashed transition-colors duration-200 cursor-pointer"
        style={{ borderColor: c.border, backgroundColor: c.fill, color: c.text }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
        onClick={onUpload}>
        <Upload size={22} style={{ color: c.primary }} />
        <span className="text-sm font-semibold">Upload</span>
        <span className="text-[11px]" style={{ color: c.textLight }}>Gallery / Files</span>
      </button>
      <button type="button"
        className="flex flex-col items-center justify-center gap-1.5 h-28 rounded-xl border border-dashed transition-colors duration-200 cursor-pointer"
        style={{ borderColor: c.border, backgroundColor: c.fill, color: c.text }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
        onClick={onTakePhoto}>
        <Camera size={22} style={{ color: c.primary }} />
        <span className="text-sm font-semibold">Take Photo</span>
        <span className="text-[11px]" style={{ color: c.textLight }}>Live camera</span>
      </button>
    </div>
  );
}
