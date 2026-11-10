"use client";

import { mapUserClaim, type UserClaim } from "@/lib/claim-mapper";
import { mapApiItem, type FoundItem } from "@/lib/item-mapper";
import { mapReport, type UserReport } from "@/lib/report-mapper";
import type { NotificationType } from "@/lib/notification-ui";

export interface CachedNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

let claimsCache: UserClaim[] | null = null;
let notificationsCache: CachedNotification[] | null = null;
let notificationsUnread = 0;
let itemsCache: FoundItem[] | null = null;
let claimedIdsCache: Set<string> | null = null;
let reportsCache: UserReport[] | null = null;

const REPORTS_CACHE_KEY = "vaultq:reports-cache";
const REPORTS_CACHE_TTL = 10 * 60 * 1000;

let lastPrefetch = 0;
let prefetching: Promise<void> | null = null;
const PREFETCH_TTL = 45_000;

export const getCachedClaims = () => claimsCache;
export const setCachedClaims = (value: UserClaim[] | null) => { claimsCache = value; };
export const getCachedNotifications = () => notificationsCache;
export const getCachedUnread = () => notificationsUnread;
export const setCachedUnread = (value: number) => { notificationsUnread = value; };
export const getCachedSearchItems = () => itemsCache;
export const getCachedClaimedIds = () => claimedIdsCache;
export const getCachedReports = () => {
  if (reportsCache) return reportsCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(REPORTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; reports?: UserReport[] };
    if (!parsed.at || Date.now() - parsed.at > REPORTS_CACHE_TTL || !Array.isArray(parsed.reports)) {
      window.sessionStorage.removeItem(REPORTS_CACHE_KEY);
      return null;
    }
    reportsCache = parsed.reports;
    return reportsCache;
  } catch {
    return null;
  }
};
export const setCachedReports = (value: UserReport[] | null) => {
  reportsCache = value;
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      window.sessionStorage.removeItem(REPORTS_CACHE_KEY);
      return;
    }
    window.sessionStorage.setItem(REPORTS_CACHE_KEY, JSON.stringify({ at: Date.now(), reports: value }));
  } catch {
    // Session storage can be unavailable in private browsing.
  }
};

export function setCachedSearchItems(value: FoundItem[] | null, claimedIds?: Set<string>) {
  itemsCache = value;
  if (claimedIds) claimedIdsCache = claimedIds;
}

export function setCachedNotifications(value: CachedNotification[] | null, unread = 0) {
  notificationsCache = value;
  notificationsUnread = unread;
}

export function clearStudentCache() {
  claimsCache = null;
  notificationsCache = null;
  notificationsUnread = 0;
  itemsCache = null;
  claimedIdsCache = null;
  reportsCache = null;
  lastPrefetch = 0;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(REPORTS_CACHE_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }
}

async function getJson(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error || `Failed to load ${url}`);
  return json;
}

/**
 * Warm the three data-heavy student tabs after login so opening them for the
 * first time does not wait for the tunnel. The shell calls this once per
 * `PREFETCH_TTL`; tabs still refresh in the background normally.
 */
export function prefetchStudentData(token: string): Promise<void> {
  if (Date.now() - lastPrefetch < PREFETCH_TTL) return Promise.resolve();
  if (prefetching) return prefetching;

  async function populate(url: string, apply: (json: any) => void) {
    try {
      const json = await getJson(url, token);
      apply(json);
    } catch {
      // Prefetching is best-effort; each tab still refreshes normally.
    }
  }

  // Populate each cache as soon as its own request finishes. Waiting for the
  // slowest tab here would make the reports cache arrive late.
  prefetching = Promise.allSettled([
    populate("/api/claims", (json) => {
      if (!Array.isArray(json.data)) return;
      const raw = json.data as any[];
      claimsCache = raw.map(mapUserClaim);
      claimedIdsCache = new Set(raw.map((cl) => cl.itemId).filter(Boolean));
    }),
    populate("/api/notifications", (json) => {
      if (!Array.isArray(json.data)) return;
      notificationsCache = json.data as CachedNotification[];
      notificationsUnread = Number(
        json.unreadCount ?? notificationsCache.filter((n) => !n.isRead).length,
      );
    }),
    populate("/api/items?light=1", (json) => {
      if (!Array.isArray(json.data)) return;
      itemsCache = (json.data as any[]).map(mapApiItem);
    }),
    populate("/api/reports?light=1", (json) => {
      if (!Array.isArray(json.data)) return;
      setCachedReports((json.data as any[]).map(mapReport));
    }),
  ]).then(() => {
    lastPrefetch = Date.now();
    // Let the bell and notifications page pick up the freshly cached count.
    window.dispatchEvent(new Event("vaultq:notifications"));
  }).finally(() => {
    prefetching = null;
  });

  return prefetching;
}
