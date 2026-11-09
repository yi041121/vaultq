"use client";

import { mapUserClaim, type UserClaim } from "@/lib/claim-mapper";
import { mapApiItem, type FoundItem } from "@/lib/item-mapper";
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
  lastPrefetch = 0;
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

  prefetching = (async () => {
    const [claims, notifications, items] = await Promise.allSettled([
      getJson("/api/claims", token),
      getJson("/api/notifications", token),
      getJson("/api/items", token),
    ]);

    if (claims.status === "fulfilled" && Array.isArray(claims.value.data)) {
      const raw = claims.value.data as any[];
      claimsCache = raw.map(mapUserClaim);
      claimedIdsCache = new Set(raw.map((cl) => cl.itemId).filter(Boolean));
    }

    if (notifications.status === "fulfilled" && Array.isArray(notifications.value.data)) {
      notificationsCache = notifications.value.data as CachedNotification[];
      notificationsUnread = Number(
        notifications.value.unreadCount ?? notificationsCache.filter((n) => !n.isRead).length,
      );
    }

    if (items.status === "fulfilled" && Array.isArray(items.value.data)) {
      itemsCache = (items.value.data as any[]).map(mapApiItem);
    }

    lastPrefetch = Date.now();
    // Let the bell and notifications page pick up the freshly cached count.
    window.dispatchEvent(new Event("vaultq:notifications"));
  })().finally(() => {
    prefetching = null;
  });

  return prefetching;
}
