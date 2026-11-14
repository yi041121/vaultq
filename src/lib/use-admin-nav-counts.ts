"use client";
import { getBrowserSessionKey } from "./browser-session-store";

import { useEffect, useState } from "react";

interface AdminNavCounts {
  claims: number;
  intake: number;
}

let cache: AdminNavCounts = { claims: 0, intake: 0 };

/**
 * Pending counts for the admin sidebar: claims awaiting review and found
 * reports awaiting verification. Cached across pages to avoid flicker.
 */
export function useAdminNavCounts(role: string) {
  const [counts, setCounts] = useState<AdminNavCounts>(cache);

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;

    async function load() {
      const token = getBrowserSessionKey();
      if (!token) return;
      try {
        const res = await fetch("/api/admin/nav-counts", {
          headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (json?.success && json.data) {
          cache = {
            claims: Number(json.data.claims || 0),
            intake: Number(json.data.intake || 0),
          };
          if (!cancelled) setCounts(cache);
        }
      } catch {
        // Keep the previous counts.
      }
    }

    void load();
    const interval = window.setInterval(load, 15_000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, [role]);

  return counts;
}
