import type { ReactNode } from "react";
import { colors } from "@/lib/design";

/**
 * Consistent description block used everywhere a description is displayed.
 * Pale-blue surface, blue border and an uppercase heading on every breakpoint.
 */
export function DescriptionBox({ title = "Description", children, className = "", contentClassName = "line-clamp-2" }: {
  title?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div data-description-box
      className={`min-w-0 rounded-xl border px-3.5 py-3 ${className}`}
      style={{
        borderColor: `color-mix(in srgb, ${colors.primary} 30%, transparent)`,
        backgroundColor: colors.primarySoft,
      }}>
      {title && (
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.primary }}>
          {title}
        </p>
      )}
      <p className={`text-[13px] leading-relaxed [overflow-wrap:anywhere] ${contentClassName}`} style={{ color: colors.textMuted }}>
        {children}
      </p>
    </div>
  );
}
