"use client";

import type { ReactNode } from "react";

/** Phone-only content. The breakpoint matches the sidebar/bottom-nav switch. */
export function MobileOnly({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`lg:hidden ${className}`}>{children}</div>;
}

/** Desktop-only content. */
export function DesktopOnly({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hidden lg:block ${className}`}>{children}</div>;
}
