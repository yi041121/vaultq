"use client";

type ThemeTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition: () => void;
};

let activeTransition: ThemeTransition | null = null;
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
let themeChange = 0;

/** Crossfade one page snapshot instead of repainting every element per frame. */
export function setTheme(dark: boolean) {
  const root = document.documentElement;
  const change = ++themeChange;
  activeTransition?.skipTransition();
  activeTransition = null;
  clearTimeout(transitionTimer);
  root.classList.remove("theme-transitioning", "theme-snapshot-transition");
  if (root.classList.contains("dark") === dark) return;

  const apply = () => {
    // A rapid second click must not be overwritten by an older callback.
    if (change !== themeChange) return;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }

  const startTransition = (document as Document & {
    startViewTransition?: (update: () => void) => ThemeTransition;
  }).startViewTransition;

  if (typeof startTransition === "function") {
    root.classList.add("theme-snapshot-transition");
    try {
      const transition = startTransition.call(document, apply);
      activeTransition = transition;
      // A hidden tab or interrupted snapshot can skip animation, not the theme.
      void transition.ready.catch(() => {});
      void transition.finished.catch(() => {}).finally(() => {
        if (change !== themeChange) return;
        apply();
        activeTransition = null;
        root.classList.remove("theme-snapshot-transition");
      });
      return;
    } catch {
      root.classList.remove("theme-snapshot-transition");
    }
  }

  // Older browsers use equal durations and zero delays for all theme colors.
  root.classList.add("theme-transitioning");
  void window.getComputedStyle(root).backgroundColor;
  apply();
  transitionTimer = setTimeout(() => {
    if (change === themeChange) root.classList.remove("theme-transitioning");
  }, 300);
}
