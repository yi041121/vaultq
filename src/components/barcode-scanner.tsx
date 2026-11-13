"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, CameraOff, Info } from "lucide-react";
import { VButton, vcolors as c } from "@/components/ui/vault";
import { useEscapeKey } from "@/lib/use-escape-key";

interface Props {
  open: boolean;
  onDetect: (code: string) => void;
  onClose: () => void;
}

function extractBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^[0-9]{10}$/.test(digits)) return digits;
  const m = digits.match(/[0-9]{10}/);
  return m ? m[0] : null;
}

export default function BarcodeScanner({ open, onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEscapeKey(open, onClose);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const html5Ref = useRef<any>(null);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    // Try BarcodeDetector first, fallback to html5-qrcode
    start();
    return () => stop();
  }, [open]);

  async function start() {
    setError(null);
    setPermissionDenied(false);
    setScanning(true);

    // Try native BarcodeDetector if available and supports code_128
    const hasNative = typeof window !== "undefined" && "BarcodeDetector" in window;
    let supportsCode128 = false;
    if (hasNative) {
      try {
        // @ts-ignore
        const formats = await window.BarcodeDetector.getSupportedFormats?.();
        supportsCode128 = !formats || formats.includes("code_128") || formats.includes("code128");
      } catch {
        supportsCode128 = true;
      }
    }

    if (hasNative && supportsCode128) {
      // Native path
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanLoopNative();
          return;
        }
      } catch (e: any) {
        const denied = e?.name === "NotAllowedError" || /permission|denied/i.test(String(e?.message || ""));
        setPermissionDenied(denied);
        setError(denied ? "Camera permission is blocked" : e?.message || "Camera access failed");
        setScanning(false);
        return;
      }
    }

    // Fallback: html5-qrcode
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const el = document.getElementById("vaultq-barcode-reader");
      if (!el) {
        setError("Scanner element not ready");
        setScanning(false);
        return;
      }
      const html5QrCode = new Html5Qrcode("vaultq-barcode-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_39,
        ],
        verbose: false,
      } as any);
      html5Ref.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 },
        } as any,
        (decodedText: string) => {
          const code = extractBarcode(decodedText);
          if (code) {
            onDetect(code);
            onClose();
          }
        },
        () => {}
      );
    } catch (e: any) {
      const msg = e?.message || "";
      if (e?.name === "NotAllowedError" || msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setPermissionDenied(true);
        setError("Camera permission is blocked");
      } else if (msg.includes("NotFoundError") || msg.includes("No camera")) {
        setPermissionDenied(false);
        setError("No camera found. Please upload a barcode photo or type the 10 digits.");
      } else if (msg.includes("NotSecureContext") || msg.includes("secure")) {
        setPermissionDenied(false);
        setError("Camera requires HTTPS. Please upload a barcode photo or type the 10 digits.");
      } else if (msg.includes("NotReadableError") || msg.includes("busy")) {
        setPermissionDenied(false);
        setError("Camera is busy. Close the other app using it, then try again.");
      } else {
        // Most scanners report a generic failure when the browser has blocked
        // camera access, so show the permission guide as the safest fallback.
        setPermissionDenied(true);
        setError("Could not start camera. Check camera permission or upload a barcode photo.");
      }
      setScanning(false);
    }
  }

  function stop() {
    setScanning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (html5Ref.current) {
      try {
        html5Ref.current.stop().catch(() => {});
        html5Ref.current.clear();
      } catch {}
      html5Ref.current = null;
    }
  }

  async function scanLoopNative() {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoopNative);
      return;
    }
    try {
      // @ts-ignore
      const detector = new window.BarcodeDetector({ formats: ["code_128", "ean_13", "code_39"] });
      const barcodes = await detector.detect(videoRef.current);
      for (const b of barcodes) {
        const code = extractBarcode(b.rawValue || "");
        if (code) {
          onDetect(code);
          onClose();
          return;
        }
      }
    } catch {}
    rafRef.current = requestAnimationFrame(scanLoopNative);
  }

  if (!open) return null;

  const hasNative = typeof window !== "undefined" && "BarcodeDetector" in window;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 vq-modal-backdrop-strong" style={{ backgroundColor: "rgba(2,6,23,0.84)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[92dvh] rounded-2xl overflow-hidden bg-black shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
          <span className="text-sm font-medium text-white flex items-center gap-2"><Camera size={16} /> Scan barcode</span>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors duration-200 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="relative bg-black aspect-[4/3] flex items-center justify-center overflow-hidden">
          {/* Native video element (for BarcodeDetector path) */}
          <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${hasNative ? "block" : "hidden"}`} />
          {/* html5-qrcode element (fallback) */}
          <div id="vaultq-barcode-reader" className={`w-full h-full ${hasNative ? "hidden" : "block"}`} />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-28 border-2 border-white/80 rounded-lg relative">
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />
            </div>
          </div>
          {error && (
            <div className="absolute inset-0 z-10 bg-white p-4 overflow-y-auto text-left">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#fef2f2" }}>
                  <CameraOff size={18} style={{ color: c.danger }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: c.text }}>
                    {permissionDenied ? "Allow camera access" : "Camera unavailable"}
                  </p>
                  <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: c.textMuted }}>{error}</p>
                </div>
              </div>

              {permissionDenied && (
                <div className="mt-2.5 rounded-lg border bg-[#f8fafc] p-2.5" style={{ borderColor: c.border }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: c.textLight }}>
                    <Info size={11} /> How to allow camera
                  </p>
                  <ol className="space-y-1 text-[10.5px] leading-relaxed" style={{ color: c.textMuted }}>
                    <li><b style={{ color: c.text }}>1.</b> Tap the lock / ⓘ icon next to the website address.</li>
                    <li><b style={{ color: c.text }}>2.</b> Open <b style={{ color: c.text }}>Permissions</b> or <b style={{ color: c.text }}>Site settings</b>.</li>
                    <li><b style={{ color: c.text }}>3.</b> Set <b style={{ color: c.text }}>Camera</b> to <b style={{ color: c.text }}>Allow</b>.</li>
                    <li><b style={{ color: c.text }}>4.</b> Return here and tap <b style={{ color: c.text }}>Try again</b>.</li>
                  </ol>
                  <p className="text-[9.5px] mt-1.5" style={{ color: c.textLight }}>
                    iPhone Safari: tap <b>aA</b> → Website Settings → Camera → Allow.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <VButton size="sm" onClick={() => void start()}><Camera size={13} /> Try again</VButton>
              </div>
            </div>
          )}
        </div>
        <div className="px-4 py-3 bg-white flex items-center justify-end shrink-0">
          <VButton variant="secondary" size="sm" onClick={onClose}>Cancel</VButton>
        </div>
      </div>
    </div>
  );
}
