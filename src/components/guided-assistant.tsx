"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, MessageCircle, RotateCcw, X } from "lucide-react";
import { colors } from "@/lib/design";
import { assistantFlowForRole, type AssistantFlow, type AssistantOption } from "@/lib/assistant-flow";

interface GuidedAssistantProps {
  role: string;
  onClose: () => void;
}

export function GuidedAssistant({ role, onClose }: GuidedAssistantProps) {
  const flow = assistantFlowForRole(role);
  return flow ? <AssistantDialog key={role} flow={flow} role={role} onClose={onClose} /> : null;
}

function AssistantDialog({ flow, role, onClose }: GuidedAssistantProps & { flow: AssistantFlow }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState<AssistantOption[]>([]);
  const current = flow[steps.at(-1)?.next ?? "home"];

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [steps]);

  return (
    <dialog ref={dialogRef} aria-labelledby="assistant-title" aria-describedby="assistant-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] rounded-2xl border p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
      style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.text }}>
      <div className="flex h-[min(640px,calc(100dvh-2rem))] flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b p-4" style={{ borderColor: colors.borderLight }}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: colors.primarySoft, color: colors.primary }}>
            <MessageCircle size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="assistant-title" className="text-sm font-semibold">VaultQ Assistant</h2>
            <p id="assistant-description" className="text-[11px]" style={{ color: colors.textMuted }}>
              {role === "ADMIN" ? "Admin" : "Student"} guide · Select an option to chat
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close assistant" autoFocus
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: colors.primarySoft, color: colors.primary }}><X size={18} /></button>
        </header>

        <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" role="log" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions">
          <p className="max-w-[94%] rounded-2xl rounded-tl-sm p-3 text-sm leading-relaxed" style={{ backgroundColor: colors.fill }}>{flow.home.message}</p>
          {steps.map((step, index) => (
            <div key={`${index}-${step.next}`} className="mt-4 space-y-3">
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm" style={{ backgroundColor: colors.primary, color: "#fff" }}>
                <span className="sr-only">You selected: </span>{step.label}
              </p>
              <p className="max-w-[94%] rounded-2xl rounded-tl-sm p-3 text-sm leading-relaxed" style={{ backgroundColor: colors.fill }}>
                {flow[step.next].message}
              </p>
            </div>
          ))}
        </div>

        <div className="max-h-[45%] shrink-0 overflow-y-auto overscroll-contain border-t p-4" style={{ borderColor: colors.borderLight }}>
          {current.action && (
            <Link href={current.action.path} onClick={onClose}
              className="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: colors.primary, color: "#fff" }}>
              {current.action.label}<ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          )}
          <div className="grid gap-2" aria-label="Suggested replies">
            {current.options?.map((option) => (
              <button key={option.next} type="button" onClick={() => setSteps((previous) => [...previous, option])}
                className="min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ backgroundColor: colors.primarySoft, borderColor: colors.border, color: colors.primary }}>
                {option.label}
              </button>
            ))}
          </div>
          {steps.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setSteps((previous) => previous.slice(0, -1))}
                className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs focus-visible:outline-2" style={{ color: colors.textMuted }}>
                <ArrowLeft size={14} aria-hidden="true" />Back
              </button>
              <button type="button" onClick={() => setSteps([])}
                className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs focus-visible:outline-2" style={{ color: colors.primary }}>
                <RotateCcw size={14} aria-hidden="true" />Main menu
              </button>
            </div>
          )}
          <p className="mt-2 text-center text-[10px]" style={{ color: colors.textMuted }}>Guided help only · No messages are sent or records changed</p>
        </div>
      </div>
    </dialog>
  );
}
