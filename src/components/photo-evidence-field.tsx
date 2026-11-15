"use client";

import { useRef, useState, type ReactNode } from "react";
import { Crop, Plus, RotateCcw, X } from "lucide-react";
import { PhotoPicker } from "@/components/photo-picker";
import { PhotoSourceDialog } from "@/components/photo-source-dialog";
import { CameraCaptureModal } from "@/components/camera-capture-modal";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { showCenteredMessage } from "@/components/centered-message";
import { compressImageFile } from "@/lib/image-compression";
import { vcolors as c } from "@/components/ui/vault";

export interface EvidencePhoto {
  preview: string;
  originalPreview: string;
  file?: File | null;
  originalFile?: File | null;
}

interface PhotoEvidenceFieldProps {
  photos: EvidencePhoto[];
  onChange: (photos: EvidencePhoto[]) => void;
  max?: number;
  label?: string;
  optional?: boolean;
  required?: boolean;
  hint?: string;
  /** Rendered under the picker while no photo is attached. */
  emptyExtra?: ReactNode;
  /** Rendered under the photos (e.g. a no-photo checkbox). */
  children?: ReactNode;
  disabled?: boolean;
}

/**
 * The one photo field used by students and admins.
 *
 * Upload, live camera (with the permission guide), crop, revert to the
 * original and add/remove all behave the same everywhere. Callers own the
 * photo array; this component owns the picker, source dialog, camera and crop
 * modals so no page can drift.
 */
export function PhotoEvidenceField({
  photos, onChange, max = 3, label = "Photo Evidence", optional = false, required = false,
  hint = `Up to ${max} photos · 5MB max each`, emptyExtra, children, disabled = false,
}: PhotoEvidenceFieldProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  function revertAt(index: number) {
    onChange(photos.map((photo, i) => (i === index
      ? {
        preview: photo.originalPreview,
        originalPreview: photo.originalPreview,
        file: photo.originalFile ?? photo.file ?? null,
        originalFile: photo.originalFile ?? photo.file ?? null,
      }
      : photo)));
  }

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (uploadRef.current) uploadRef.current.value = "";
    if (!files.length) return;
    if (photos.length + files.length > max) {
      showCenteredMessage("error", `You can upload up to ${max} photo${max === 1 ? "" : "s"}`);
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
        showCenteredMessage("error", "Please upload image files only");
        return;
      }
    }
    try {
      const drafts = await Promise.all(files.map(async (file): Promise<EvidencePhoto> => {
        const compressed = await compressImageFile(file);
        return {
          file: compressed.file,
          preview: compressed.preview,
          originalFile: compressed.file,
          originalPreview: compressed.preview,
        };
      }));
      onChange([...photos, ...drafts].slice(0, max));
    } catch (error) {
      showCenteredMessage("error", error instanceof Error ? error.message : "Could not process one of the images");
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: c.textMuted }}>
          {label}
          {optional && (
            <span className="font-normal normal-case tracking-normal" style={{ color: c.textLight }}> (optional)</span>
          )}
          {required && <span style={{ color: c.danger }}> *</span>}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: c.textLight }}>{photos.length}/{max}</span>
          {!disabled && photos.length > 0 && photos.length < max && (
            <button type="button" onClick={() => setSourceOpen(true)}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border bg-white px-2.5 text-[11px] font-semibold"
              style={{ borderColor: c.border, color: c.primary }}>
              <Plus size={13} /> Add photo
            </button>
          )}
        </div>
      </div>

      <input ref={uploadRef} type="file" accept="image/*" multiple={max > 1} className="hidden"
        onChange={(event) => void addFiles(event.target.files)} disabled={disabled} />

      {photos.length === 0 ? (
        <div>
          <PhotoPicker
            onUpload={() => uploadRef.current?.click()}
            onTakePhoto={() => setCameraOpen(true)}
          />
          {emptyExtra}
        </div>
      ) : (
        <div className={`grid gap-2 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
          {photos.map((photo, index) => (
            <div key={`${index}-${photo.preview.slice(-16)}`}
              className="group relative overflow-hidden rounded-xl border"
              style={{ borderColor: c.border }}>
              <button type="button" onClick={() => setCropIndex(index)}
                className="block w-full cursor-pointer" aria-label={`View or crop photo ${index + 1}`}>
                <img src={photo.preview} alt={`Photo ${index + 1}`}
                  className={`w-full object-contain ${photos.length === 1 ? "h-40" : "h-28"}`} />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/30">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <Crop size={13} /> View &amp; crop
                  </span>
                </span>
              </button>
              {photo.preview !== photo.originalPreview && (
                <button type="button" onClick={() => revertAt(index)}
                  aria-label={`Revert photo ${index + 1} to original`}
                  className="absolute bottom-2 left-2 z-10 inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-black/60 px-2 text-[10px] font-semibold text-white hover:bg-black/80">
                  <RotateCcw size={11} /> Revert
                </button>
              )}
              {!disabled && (
                <button type="button" onClick={() => removeAt(index)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {hint && <p className="mt-2 text-center text-[11px]" style={{ color: c.textLight }}>{hint}</p>}
      {children}

      {sourceOpen && (
        <PhotoSourceDialog
          title={`Add ${label.toLowerCase()}`}
          description={`Attach another photo (up to ${max}).`}
          onClose={() => setSourceOpen(false)}
          onTakePhoto={() => { setSourceOpen(false); setCameraOpen(true); }}
          onUpload={() => { setSourceOpen(false); uploadRef.current?.click(); }}
        />
      )}

      {cameraOpen && (
        <CameraCaptureModal
          onClose={() => setCameraOpen(false)}
          onUseUpload={() => { setCameraOpen(false); uploadRef.current?.click(); }}
          onCapture={(photo) => {
            onChange([...photos, {
              file: photo.file,
              preview: photo.preview,
              originalFile: photo.file,
              originalPreview: photo.preview,
            }].slice(0, max));
            setCameraOpen(false);
          }}
        />
      )}

      {cropIndex !== null && photos[cropIndex] && (
        <PhotoCropModal
          src={photos[cropIndex].preview}
          onClose={() => setCropIndex(null)}
          onSave={(photo) => {
            onChange(photos.map((entry, i) => (i === cropIndex
              ? { ...entry, file: photo.file ?? entry.file ?? null, preview: photo.preview }
              : entry)));
            setCropIndex(null);
          }}
        />
      )}
    </div>
  );
}
