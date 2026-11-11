import type { ReactNode } from "react";
import { colors } from "@/lib/design";

/** Keep long card explanations bounded, with the same border in both themes. */
export function DescriptionBox({ title, children, className = "", contentClassName = "line-clamp-2" }: {
  title?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div data-description-box className={`min-w-0 rounded-xl border px-3 py-2.5 ${className}`}
      style={{ borderColor: colors.border, backgroundColor: colors.fill }}>
      {title && <p className="text-[11px] font-semibold mb-1" style={{ color: colors.text }}>{title}</p>}
      <p className={`text-xs leading-relaxed [overflow-wrap:anywhere] ${contentClassName}`} style={{ color: colors.textMuted }}>{children}</p>
    </div>
  );
}
