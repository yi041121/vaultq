"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera } from "lucide-react";
import { VButton, vcolors as c } from "@/components/ui/vault";

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
  const [error, setError] = useState<string | null>(null);
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
        setError(e?.message || "Camera access denied. Please allow camera or upload image.");
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
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setError("Camera permission denied. Please allow camera or upload image.");
      } else if (msg.includes("NotFoundError")) {
        setError("No camera found. Please upload barcode image.");
      } else if (msg.includes("NotSecureContext") || msg.includes("secure")) {
        setError("Camera requires HTTPS or localhost. Please upload image or type 2000132602.");
      } else {
        setError(msg || "Could not start camera. Please upload image or type manually.");
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden bg-black shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-black/80">
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
            <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-red-500/90 text-white text-xs p-3 text-center">
              {error}
            </div>
          )}
          {!error && scanning && (
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs font-medium text-white bg-black/60 px-3 py-1.5 rounded-full whitespace-nowrap">
              Point camera at barcode — 10 digits e.g. 2000132602
            </p>
          )}
        </div>
        <div className="px-4 py-3 bg-white flex items-center justify-between">
          <p className="text-xs" style={{ color: c.textMuted }}>Will auto-detect 10-digit code</p>
          <VButton variant="secondary" size="sm" onClick={onClose}>Cancel</VButton>
        </div>
      </div>
    </div>
  );
}
