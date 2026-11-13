"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { vcolors as c } from "@/components/ui/vault";
import { useEscapeKey } from "@/lib/use-escape-key";

interface StudentBarcodeModalProps {
  barcode?: string | null;
  studentId?: string | null;
  name?: string;
  onClose: () => void;
}

/**
 * Digital version of the student card barcode. Code 128 is used instead of a
 * QR code because the locker's first step is a barcode scanner. The value is
 * either the card barcode or the student ID, both accepted by identify API.
 */
export function StudentBarcodeModal({ barcode, studentId, name, onClose }: StudentBarcodeModalProps) {
  const value = (barcode || studentId || "").trim();
  const usingStudentId = !barcode && !!studentId;
  const label = usingStudentId ? "Student ID barcode" : "Card barcode";
  const svgRef = useRef<SVGSVGElement>(null);
  const [renderError, setRenderError] = useState(false);

  useEscapeKey(true, onClose);

  useEffect(() => {
    if (!value || !svgRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const JsBarcode = (await import("jsbarcode")).default;
        if (cancelled || !svgRef.current) return;
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          displayValue: true,
          fontSize: 16,
          height: 80,
          width: 2,
          margin: 10,
          background: "#ffffff",
          lineColor: "#0f172a",
        });
      } catch {
        if (!cancelled) setRenderError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [value]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Your student barcode"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
        style={{ border: `1px solid ${c.border}` }}>
        <button type="button" onClick={onClose} aria-label="Close barcode"
          className="absolute right-3 top-3 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer"
          style={{ color: c.textMuted }}>
          <X size={16} />
        </button>

        <h3 className="text-base font-semibold" style={{ color: c.text }}>Your student barcode</h3>
        {name && <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>{name}</p>}

        {value ? (
          <>
            <div className="mt-5 rounded-xl border p-3" style={{ borderColor: c.borderLight }}>
              {renderError ? (
                <div className="h-28 flex items-center justify-center text-xs" style={{ color: c.textLight }}>
                  Could not draw the barcode. Use the number below.
                </div>
              ) : (
                <svg ref={svgRef} className="w-full h-auto" role="img" aria-label={`${label} barcode`} />
              )}
            </div>
            <p className="text-[11px] leading-relaxed mt-4" style={{ color: c.textMuted }}>
              Show this barcode to the locker scanner if you forgot your physical student card.
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
