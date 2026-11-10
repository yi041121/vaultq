"use client";

import { useEffect, useState } from "react";
import { Check, Copy, QrCode, X } from "lucide-react";
import { vcolors as c } from "@/components/ui/vault";
import { useEscapeKey } from "@/lib/use-escape-key";

interface StudentBarcodeModalProps {
  barcode?: string | null;
  studentId?: string | null;
  name?: string;
  onClose: () => void;
}

/**
 * Digital version of the student card barcode. The locker's step-1 scanner
 * accepts either the card barcode or the student ID, so this gives students
 * a way to unlock their locker when they forgot the physical card.
 */
export function StudentBarcodeModal({ barcode, studentId, name, onClose }: StudentBarcodeModalProps) {
  const value = (barcode || studentId || "").trim();
  const usingStudentId = !barcode && !!studentId;
  const label = usingStudentId ? "Student ID barcode" : "Card barcode";
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEscapeKey(true, onClose);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    (async () => {
      try {
        const QRCode = await import("qrcode");
        const url = await QRCode.toDataURL(value, {
          width: 320,
          margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setQr(url);
      } catch {
        // The barcode number is still shown as a fallback.
      }
    })();
    return () => { cancelled = true; };
  }, [value]);

  async function copyValue() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions can be unavailable; the number remains visible.
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Your student barcode"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
        style={{ border: `1px solid ${c.border}` }}>
        <button type="button" onClick={onClose} aria-label="Close barcode"
          className="absolute right-3 top-3 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer"
          style={{ color: c.textMuted }}>
          <X size={16} />
        </button>

        <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center mb-3"
          style={{ backgroundColor: `${c.primary}15`, color: c.primary }}>
          <QrCode size={22} />
        </div>
        <h3 className="text-base font-semibold" style={{ color: c.text }}>Your student barcode</h3>
        {name && <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>{name}</p>}

        {value ? (
          <>
            <div className="mt-5 rounded-xl border p-4 inline-block" style={{ borderColor: c.borderLight }}>
              {qr ? (
                <img src={qr} alt={`${label} QR code`} className="w-52 h-52 object-contain" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs" style={{ color: c.textLight }}>
                  Preparing barcode…
                </div>
              )}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mt-4" style={{ color: c.textLight }}>{label}</p>
            <p className="text-2xl font-bold tracking-[0.18em] tabular-nums mt-1" style={{ color: c.text }}>{value}</p>
            <button type="button" onClick={() => void copyValue()}
              className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-semibold cursor-pointer"
              style={{ borderColor: c.border, color: c.primary }}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy number"}
            </button>
            <p className="text-[11px] leading-relaxed mt-4" style={{ color: c.textMuted }}>
              Show this QR code to the locker scanner if you forgot your physical student card.
            </p>
            {usingStudentId && (
              <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: c.textLight }}>
                Your card barcode is not registered, so this uses your student ID. The locker accepts either one.
              </p>
            )}
          </>
        ) : (
          <div className="mt-5 rounded-xl border px-4 py-6" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb" }}>
            <p className="text-sm font-medium" style={{ color: "#92400e" }}>No barcode on file</p>
            <p className="text-xs leading-relaxed mt-1.5" style={{ color: "#92400e" }}>
              Enter your 10-digit card barcode in your profile, or ask an admin to assign one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
