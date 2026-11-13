"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Info, Loader2, Upload, X } from "lucide-react";
import { VButton, VCard, vcolors as c } from "@/components/ui/vault";
import { useEscapeKey } from "@/lib/use-escape-key";
import { compressImageFile } from "@/lib/image-compression";

interface CameraCaptureModalProps {
  onClose: () => void;
  onCapture: (photo: { file: File; preview: string }) => void;
  onUseUpload: () => void;
}

interface CameraError {
  title: string;
  message: string;
  permission?: boolean;
}

function describeCameraError(error: unknown): CameraError {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return {
      title: "Camera permission needed",
      message: "Allow camera access for this site, then tap Try again.",
      permission: true,
    };
  }
  if (name === "NotFoundError") {
    return { title: "No camera found", message: "This device does not have an available camera." };
  }
  if (name === "NotReadableError") {
    return { title: "Camera is busy", message: "Close the other app using the camera, then try again." };
  }
  if (name === "NotSupportedError") {
    return { title: "Camera unavailable", message: "This browser does not support live camera capture." };
  }
  if (!window.isSecureContext) {
    return {
      title: "Camera needs a secure connection",
      message: "Open the app on localhost or HTTPS, or upload a photo instead.",
    };
  }
  return { title: "Could not open camera", message: "Try again, or upload a photo from your files." };
}

/** Live camera capture used by the report photo picker. */
export function CameraCaptureModal({ onClose, onCapture, onUseUpload }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(true);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<CameraError | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    stopStream();
    try {
      if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
        throw new DOMException("Camera API unavailable", "NotSupportedError");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStarting(false);
    } catch (err) {
      stopStream();
      setStarting(false);
      setError(describeCameraError(err));
    }
  }, [stopStream]);

  useEffect(() => {
    activeRef.current = true;
    void start();
    return () => {
      activeRef.current = false;
      stopStream();
    };
  }, [start, stopStream]);

  function close() {
    stopStream();
    onClose();
  }

  useEscapeKey(true, close);

  function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setError({ title: "Camera not ready", message: "Wait a moment, then try again." });
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.9);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `report-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      try {
        const compressed = await compressImageFile(file);
        onCapture({ file: compressed.file, preview: compressed.preview });
        close();
      } catch (err) {
        setError({
          title: "Could not process photo",
          message: err instanceof Error ? err.message : "Please try again.",
        });
      }
    }, "image/jpeg", 0.9);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={close} />
      <VCard className="relative w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: c.text }}>Take photo</h3>
          <button type="button" onClick={close}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer"
            style={{ color: c.textMuted }} aria-label="Close camera">
            <X size={16} />
          </button>
        </div>

        {error ? (
          <div className="rounded-xl p-5 text-center" style={{ backgroundColor: "#fef2f2" }}>
            <CameraOff size={28} className="mx-auto mb-2" style={{ color: c.danger }} />
            <p className="text-sm font-semibold" style={{ color: c.text }}>{error.title}</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: c.textMuted }}>{error.message}</p>

            {error.permission && (
              <div className="mt-3 rounded-lg border bg-white p-3 text-left" style={{ borderColor: c.border }}>
                <div className="rounded-md px-2 py-1.5 mb-2 flex items-center gap-1.5" style={{ backgroundColor: c.fill }}>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: "#dbeafe", boxShadow: "0 0 0 1px #93c5fd", transform: "translateY(-1px)" }}>
                    <Info size={10} style={{ color: c.primary }} />
                  </span>
                  <span className="text-[10px] leading-none truncate" style={{ color: c.textMuted }}>localhost:3000</span>
                </div>
                <ol className="space-y-1 text-[11px] leading-relaxed" style={{ color: c.textMuted }}>
                  <li><b style={{ color: c.text }}>1.</b> Click the information icon (i) in the address bar.</li>
                  <li><b style={{ color: c.text }}>2.</b> Turn Camera on, or click Reset permission.</li>
                  <li><b style={{ color: c.text }}>3.</b> Come back and tap Try again.</li>
                </ol>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {starting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                  <Loader2 size={22} className="animate-spin" />
                  <span className="text-xs">Starting camera...</span>
                </div>
              )}
            </div>
            <p className="text-[11px] mt-3 text-center" style={{ color: c.textMuted }}>
              Position the item in the frame, then capture.
            </p>
          </>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          {error ? (
            <>
              <VButton variant="secondary" onClick={onUseUpload}><Upload size={14} /> Use upload</VButton>
              <VButton onClick={() => void start()}><Camera size={14} /> Try again</VButton>
            </>
          ) : (
            <>
              <VButton variant="secondary" onClick={close}>Cancel</VButton>
              <VButton onClick={capture} disabled={starting}><Camera size={14} /> Capture</VButton>
            </>
          )}
        </div>
      </VCard>
    </div>
  );
}
