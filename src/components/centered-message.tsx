"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { colors } from "@/lib/design";

// Shared centered message popup — the single style used for every success
// and error notice across the app (same look as the login page popups).
// Usage: import { showCenteredMessage, CenteredMessageHost }
//   showCenteredMessage("success", "Title", "subtitle?");
//   showCenteredMessage("error", "Title", "subtitle?");
// Mount <CenteredMessageHost /> once per page shell (StudentShell mounts it).

type Kind = "success" | "error";
interface Msg {
  id: number;
  kind: Kind;
  title: string;
  subtitle?: string;
  duration: number;
}

let listener: ((m: Msg) => void) | null = null;
let idSeq = 0;

export function showCenteredMessage(kind: Kind, title: string, subtitle?: string, duration = 1500) {
  listener?.({ id: ++idSeq, kind, title, subtitle, duration });
}

export function CenteredMessageHost() {
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    listener = (m) => setMsg(m);
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.duration);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;

  const isError = msg.kind === "error";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ backgroundColor: "rgba(15,23,42,0.35)" }}
      onClick={() => setMsg(null)}>
      <div className="rounded-[20px] px-8 py-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
        style={{ background: colors.card, boxShadow: "0 20px 48px rgba(0,0,0,0.28)" }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
          style={{ backgroundColor: `color-mix(in srgb, ${isError ? colors.danger : "#16a34a"} 14%, transparent)` }}>
          {isError ? <XCircle size={30} style={{ color: colors.danger }} /> : <CheckCircle2 size={30} style={{ color: "#16a34a" }} />}
        </div>
        <p className="text-base font-semibold text-center" style={{ color: colors.text }}>{msg.title}</p>
        {msg.subtitle && (
          <p className="text-xs mt-1 text-center" style={{ color: colors.textMuted }}>{msg.subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default CenteredMessageHost;
