"use client";
import { fetchReportPages } from "./report-pages";

const TTL = 30_000;
const entries = new Map<string, { data: unknown[]; at: number }>();
const pending = new Map<string, Promise<Response>>();
const resets = new Set<() => void>();
const warmedImages = new Set<string>();
let owner: string | null = null;
let generation = 0;

export function registerAdminCacheReset(reset: () => void) {
  resets.add(reset);
}

export function clearAdminData() {
  generation++;
  entries.clear();
  pending.clear();
  warmedImages.clear();
  owner = null;
  for (const reset of resets) reset();
}

/** Mutations invalidate shared lists; the current page still keeps its UI. */
export function invalidateAdminData() {
  generation++;
  entries.clear();
  pending.clear();
}

/** Short-lived, account-scoped list cache with in-flight request coalescing. */
export async function fetchAdminData(url: string, token: string, force = false): Promise<Response> {
  if (owner !== token) {
    clearAdminData();
    owner = token;
  }
  if (!force) {
    const cached = entries.get(url);
    if (cached && Date.now() - cached.at < TTL) return Response.json({ success: true, data: cached.data });
    const request = pending.get(url);
    if (request) return (await request).clone();
  }
  const version = generation;
  const request = (async () => {
    const response = url.startsWith("/api/reports?")
      ? await fetchReportPages(url, token)
      : await fetch(url, { headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" }, cache: "no-store" });
    if (version !== generation || owner !== token) throw new Error("Admin list request was superseded");
    if (response.ok) {
      const payload = await response.clone().json().catch(() => null);
      if (version !== generation || owner !== token) throw new Error("Admin list request was superseded");
      if (version === generation && owner === token && payload?.success && Array.isArray(payload.data)) {
        entries.set(url, { data: payload.data, at: Date.now() });
      }
    }
    return response;
  })();
  pending.set(url, request);
  try {
    return (await request).clone();
  } finally {
    if (pending.get(url) === request) pending.delete(url);
  }
}

const PAGE_LISTS: Record<string, string[]> = {
  claims: ["/api/claims?light=1", "/api/reports?light=1"],
  reports: ["/api/reports?light=1"],
  items: ["/api/items?light=1"],
  accounts: ["/api/accounts"],
  lockers: ["/api/lockers?light=1"],
};

export async function prefetchAdminPage(path: string, token: string) {
  const page = path.split("?")[0].split("/").pop() || "";
  await Promise.allSettled((PAGE_LISTS[page] || []).map(async (url) => {
    const response = await fetchAdminData(url, token);
    if (!response.ok || owner !== token) return;
    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload?.data) || typeof Image === "undefined") return;
    // Warm only the first visible thumbnails, not every full gallery.
    for (const record of payload.data.slice(0, 2)) {
      for (const source of [record.imageUrl, record.item?.imageUrl, record.evidenceImageUrl]) {
        if (typeof source !== "string" || !source || warmedImages.has(source)) continue;
        warmedImages.add(source);
        const image = new Image();
        image.src = source;
      }
    }
  }));
}

export function prefetchAdminData(token: string) {
  return Promise.allSettled(Object.keys(PAGE_LISTS).map(page => prefetchAdminPage(`/dashboard/admin/${page}`, token)));
}
