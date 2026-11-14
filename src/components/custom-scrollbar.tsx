"use client";

import { useEffect, useState, type RefObject } from "react";

const RAIL_INSET = 12;

interface Metrics {
  visible: boolean;
  thumbHeight: number;
  thumbTop: number;
}

/**
 * Always-visible scroll indicator for a scroll container. iOS Safari ignores
 * custom scrollbar colours and hides overlay scrollbars, so the report form
 * uses this lightweight rail instead of the native scrollbar.
 */
export function CustomScrollbar({ targetRef, className = "" }: {
  targetRef: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [metrics, setMetrics] = useState<Metrics>({ visible: false, thumbHeight: 0, thumbTop: 0 });

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const trackHeight = Math.max(0, target.clientHeight - RAIL_INSET * 2);
      const maxScroll = target.scrollHeight - target.clientHeight;
      const visible = maxScroll > 4 && trackHeight > 0;
      const thumbHeight = visible
        ? Math.max(32, Math.round((target.clientHeight / target.scrollHeight) * trackHeight))
        : 0;
      const maxTop = Math.max(0, trackHeight - thumbHeight);
      const thumbTop = maxScroll > 0 ? Math.round((target.scrollTop / maxScroll) * maxTop) : 0;
      setMetrics((previous) =>
        previous.visible === visible && previous.thumbHeight === thumbHeight && previous.thumbTop === thumbTop
          ? previous
          : { visible, thumbHeight, thumbTop },
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    schedule();
    target.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(target);
    const mutationObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
    mutationObserver?.observe(target, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      target.removeEventListener("scroll", schedule);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [targetRef]);

  if (!metrics.visible) return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute right-1.5 top-3 bottom-3 w-1.5 rounded-full ${className}`}
      style={{ backgroundColor: "color-mix(in srgb, var(--vq-primary) 12%, transparent)" }}
    >
      <div
        className="absolute left-0 right-0 rounded-full"
        style={{
          top: metrics.thumbTop,
          height: metrics.thumbHeight,
          backgroundColor: "var(--vq-primary)",
        }}
      />
    </div>
  );
}
