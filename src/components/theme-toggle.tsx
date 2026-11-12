"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { colors } from "@/lib/design";
import { setTheme } from "@/lib/theme";

const STORAGE_KEY = "vaultq-theme";

/** Small light/dark switch that sits beside the notification bell. */
export function ThemeToggle({ sidebar = false, expanded = false }: { sidebar?: boolean; expanded?: boolean }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue === "dark";
      setDark(next);
      setTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing can block localStorage; the class still applies.
    }
  }

  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      aria-pressed={dark}
      onClick={toggle}
      className={`relative flex items-center cursor-pointer transition-colors duration-200 ${sidebar ? expanded ? "w-full h-11 px-4 gap-3 rounded-full" : "w-11 h-11 justify-center rounded-full" : "w-9 h-9 rounded-xl justify-center"}`}
      style={{ backgroundColor: sidebar ? "transparent" : colors.borderLight, color: dark ? "#fbbf24" : colors.textMuted }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.primarySoft; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = sidebar ? "transparent" : colors.borderLight; }}
    >
      <span className="relative w-[18px] h-[18px] shrink-0" aria-hidden="true">
      <Sun size={18} data-theme-icon className={`absolute transition-[opacity,transform] duration-300 motion-reduce:transition-none ${mounted && dark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75"}`} />
      <Moon size={18} data-theme-icon className={`absolute transition-[opacity,transform] duration-300 motion-reduce:transition-none ${mounted && dark ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"}`} />
      </span>
      {sidebar && expanded && <span className="text-sm font-medium" style={{ color: colors.textMuted }}>Appearance</span>}
    </button>
  );
}
