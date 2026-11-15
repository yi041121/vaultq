"use client";

import { ChevronRight, PackageCheck, PackageSearch } from "lucide-react";
import { vcolors as c } from "@/components/ui/vault";

const FOUND_COLOR = "#4a9d6b";
const FOUND_BUTTON = "#3f8a5c";

export interface ReportTypeChooserProps {
  expandedChoice: "LOST" | "FOUND" | null;
  onActivate: (type: "LOST" | "FOUND") => void;
  onButtonRef: (type: "LOST" | "FOUND", node: HTMLButtonElement | null) => void;
}

/** Two large Lost / Found choices shown before the report form opens. */
export function ReportTypeChooser({ expandedChoice, onActivate, onButtonRef }: ReportTypeChooserProps) {
  return (
    <div className="grid grid-cols-1 gap-5 w-full max-w-[420px] mx-auto">
      <button type="button" onClick={() => onActivate("LOST")} aria-label="Report Lost Item"
        ref={(node) => onButtonRef("LOST", node)}
        aria-expanded={expandedChoice === "LOST"} data-expanded={expandedChoice === "LOST"}
        className="vq-report-choice group flex w-full flex-col items-center text-center rounded-2xl border-2 p-8 transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none"
        style={{ borderColor: `color-mix(in srgb, ${c.primary} 55%, ${c.border})`, backgroundColor: c.card }}>
        <div className="w-16 h-16 shrink-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.primarySoft }}>
          <PackageSearch size={30} style={{ color: c.primary }} />
        </div>
        <h3 className="text-lg font-semibold mt-4" style={{ color: c.text }}>Lost Item</h3>
        <div className="vq-report-choice-details w-full">
          <div className="min-h-0 overflow-hidden"><div className="pt-4">
          <p className="text-sm mb-4" style={{ color: c.textMuted }}>I lost something on campus and need help finding it.</p>
          <span className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: c.primary }}>
            Select Lost Item <ChevronRight size={16} />
          </span>
          </div></div>
        </div>
      </button>
      <button type="button" onClick={() => onActivate("FOUND")} aria-label="Report Found Item"
        ref={(node) => onButtonRef("FOUND", node)}
        aria-expanded={expandedChoice === "FOUND"} data-expanded={expandedChoice === "FOUND"}
        className="vq-report-choice group flex w-full flex-col items-center text-center rounded-2xl border-2 p-8 transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none"
        style={{ borderColor: `color-mix(in srgb, ${FOUND_COLOR} 60%, ${c.border})`, backgroundColor: c.card }}>
        <div className="w-16 h-16 shrink-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${FOUND_COLOR} 10%, transparent)` }}>
          <PackageCheck size={30} style={{ color: FOUND_COLOR }} />
        </div>
        <h3 className="text-lg font-semibold mt-4" style={{ color: FOUND_COLOR }}>Found Item</h3>
        <div className="vq-report-choice-details w-full">
          <div className="min-h-0 overflow-hidden"><div className="pt-4">
          <p className="text-sm mb-4" style={{ color: c.textMuted }}>I found an item and want to hand it in.</p>
          <span className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: FOUND_BUTTON }}>
            Select Found Item <ChevronRight size={16} />
          </span>
          </div></div>
        </div>
      </button>
    </div>
  );
}
