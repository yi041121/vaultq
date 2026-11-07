"use client";

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
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [claimsRes, reportsRes] = await Promise.all([
          fetch("/api/claims", { headers, cache: "no-store" }),
          fetch("/api/reports", { headers, cache: "no-store" }),
        ]);
        const claimsJson = await claimsRes.json().catch(() => null);
        const reportsJson = await reportsRes.json().catch(() => null);
        const claims = claimsJson?.success && Array.isArray(claimsJson.data)
          ? claimsJson.data.filter((c: any) => c.status === "PENDING").length
          : 0;
        const intake = reportsJson?.success && Array.isArray(reportsJson.data)
          ? reportsJson.data.filter((r: any) => r.type === "FOUND" && r.status === "PENDING").length
          : 0;
        // Lost reports live in the Claims page, so they count toward that badge.
        const pendingLost = reportsJson?.success && Array.isArray(reportsJson.data)
          ? reportsJson.data.filter((r: any) => r.type === "LOST" && r.status === "PENDING").length
          : 0;
        cache = { claims: claims + pendingLost, intake };
        if (!cancelled) setCounts(cache);
      } catch {
        // Keep the previous counts.
      }
    }

    void load();
    const interval = window.setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, [role]);

  return counts;
}
