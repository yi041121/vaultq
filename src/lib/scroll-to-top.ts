let activeFrame = 0;

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Animate the document back to the top. `window.scrollTo({ behavior: "smooth" })`
 * is inconsistent on mobile browsers, so this uses requestAnimationFrame and
 * plain scrollTo coordinates instead. Respects reduced-motion preferences.
 */
export function scrollPageToTop(options: { duration?: number } = {}) {
  if (typeof window === "undefined") return;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduceMotion || typeof window.requestAnimationFrame !== "function") {
    if (activeFrame) window.cancelAnimationFrame?.(activeFrame);
    activeFrame = 0;
    window.scrollTo(0, 0);
    return;
  }

  const start = window.scrollY || window.pageYOffset || 0;
  if (start <= 0) return;

  const duration = Math.max(1, options.duration ?? Math.min(450, Math.max(240, start * 0.22)));
  let startedAt: number | null = null;

  if (activeFrame) window.cancelAnimationFrame?.(activeFrame);

  const step = (now: number) => {
    if (startedAt === null) startedAt = now;
    const progress = Math.min(1, (now - startedAt) / duration);
    window.scrollTo(0, Math.round(start * (1 - easeOutCubic(progress))));
    activeFrame = progress < 1 ? window.requestAnimationFrame(step) : 0;
  };

  activeFrame = window.requestAnimationFrame(step);
}
