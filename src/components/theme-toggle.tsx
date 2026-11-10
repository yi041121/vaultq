"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { colors } from "@/lib/design";

const STORAGE_KEY = "vaultq-theme";

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Small light/dark switch that sits beside the notification bell. */
export function ThemeToggle() {
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
      className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200"
      style={{ backgroundColor: colors.borderLight, color: dark ? "#fbbf24" : colors.textMuted }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.primarySoft; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.borderLight; }}
    >
      {mounted && dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
