"use client";

import { X } from "lucide-react";
import { PhotoPicker } from "@/components/photo-picker";
import { VCard, vcolors as c } from "@/components/ui/vault";

interface PhotoSourceDialogProps {
  title?: string;
  onClose: () => void;
  onTakePhoto: () => void;
  onUpload: () => void;
}

/** Lets the student choose between the file picker and the camera. */
export function PhotoSourceDialog({
  title = "Add a photo",
  onClose,
  onTakePhoto,
  onUpload,
}: PhotoSourceDialogProps) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <VCard className="relative w-full max-w-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold" style={{ color: c.text }}>{title}</h3>
            <p className="text-xs mt-1" style={{ color: c.textMuted }}>Add another photo to your report.</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0"
            style={{ color: c.textMuted }} aria-label="Close photo options">
            <X size={16} />
          </button>
        </div>
        <PhotoPicker onUpload={onUpload} onTakePhoto={onTakePhoto} />
      </VCard>
    </div>
  );
}
