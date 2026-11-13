"use client";

import { AlertTriangle } from "lucide-react";
import { useEscapeKey } from "@/lib/use-escape-key";
import { vcolors as c } from "@/components/ui/vault";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** "danger" (default) for destructive actions, "primary" for neutral confirmations. */
  tone?: "danger" | "primary";
}

/** Centered confirmation dialog (white card, red warning icon, Cancel + confirm). */
export function ConfirmDialog({ open, title, subtitle, cancelLabel = "Cancel", confirmLabel, onCancel, onConfirm, tone = "danger" }: ConfirmDialogProps) {
  const isPrimary = tone === "primary";
  useEscapeKey(open, onCancel);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} onClick={onCancel} />
      <div className="relative w-full max-w-sm p-6 text-center rounded-2xl border bg-white" style={{ borderColor: c.border }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: isPrimary ? c.primarySoft : "#fef2f2" }}>
          <AlertTriangle size={22} style={{ color: isPrimary ? c.primary : c.danger }} />
        </div>
        <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>{title}</h3>
        {subtitle && <p className="text-xs mb-5" style={{ color: c.textMuted }}>{subtitle}</p>}
        <div className={`flex items-center gap-2 ${subtitle ? "" : "mt-5"}`}>
          <button type="button" onClick={onCancel}
            className="flex-1 h-10 rounded-xl text-sm font-semibold border bg-white transition-colors duration-200 cursor-pointer"
            style={{ borderColor: c.border, color: c.textMuted }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 h-10 rounded-xl text-sm font-semibold transition-colors duration-200 cursor-pointer"
            style={{ backgroundColor: isPrimary ? c.primary : c.danger, color: "#fff" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
