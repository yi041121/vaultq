"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Clock,
  Package, ChevronRight,
  RefreshCw, AlertCircle,
  Eye, MapPin
} from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VCard, VContentPanel, VBadge, VButton, vcolors as c, font as f } from "@/components/ui/vault";
import { mapApiItem, type FoundItem } from "@/lib/item-mapper";
import { formatDisplayDate } from "@/lib/date-format";
import { CLAIM_STATUS_COLOR, mapUserClaim, type UserClaim } from "@/lib/claim-mapper";
import { NOTIFICATION_META, relativeTime } from "@/lib/notification-ui";
import { resolveNotificationLink } from "@/lib/notification-link";
import {
  getCachedClaims,
  getCachedNotifications,
  getCachedSearchItems,
  setCachedClaims,
  setCachedNotifications,
  setCachedSearchItems,
  type CachedNotification,
} from "@/lib/student-cache";

interface User { id: string; name: string; email: string; role: string; }

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<FoundItem[]>([]);
  const [claims, setClaims] = useState<UserClaim[]>([]);
  const [notifications, setNotifications] = useState<CachedNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  function viewItemDetails(name: string) {
    router.push(`/dashboard/student/search?view=${encodeURIComponent(name)}`);
  }

  const loadDashboard = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setDataError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [itemsRes, claimsRes, notificationsRes] = await Promise.all([
        fetch("/api/items?light=1", { headers, cache: "no-store" }),
        fetch("/api/claims", { headers, cache: "no-store" }),
        fetch("/api/notifications", { headers, cache: "no-store" }),
      ]);
      const [itemsJson, claimsJson, notificationsJson] = await Promise.all([
        itemsRes.json().catch(() => null),
        claimsRes.json().catch(() => null),
        notificationsRes.json().catch(() => null),
      ]);
      if (!itemsRes.ok || !itemsJson?.success) throw new Error(itemsJson?.error || "Failed to load found items");
      if (!claimsRes.ok || !claimsJson?.success) throw new Error(claimsJson?.error || "Failed to load claims");
      if (!notificationsRes.ok || !notificationsJson?.success) throw new Error(notificationsJson?.error || "Failed to load announcements");

      const mappedItems = (Array.isArray(itemsJson.data) ? itemsJson.data : []).map(mapApiItem);
      const mappedClaims = (Array.isArray(claimsJson.data) ? claimsJson.data : []).map(mapUserClaim);
      const rawNotifications = (Array.isArray(notificationsJson.data) ? notificationsJson.data : []) as CachedNotification[];
      const unread = Number(notificationsJson.unreadCount ?? rawNotifications.filter((n) => !n.isRead).length);

      setItems(mappedItems);
      setClaims(mappedClaims);
      setNotifications(rawNotifications);
      setCachedSearchItems(mappedItems);
      setCachedClaims(mappedClaims);
      setCachedNotifications(rawNotifications, unread);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Failed to load dashboard");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    // Client-only mount flag; this is the standard hydration guard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
      return;
    }
    setUser(JSON.parse(stored));

    const cachedItems = getCachedSearchItems();
    const cachedClaims = getCachedClaims();
    const cachedNotifications = getCachedNotifications();
    if (cachedItems) setItems(cachedItems);
    if (cachedClaims) setClaims(cachedClaims);
    if (cachedNotifications) setNotifications(cachedNotifications);
    if (!cachedItems && !cachedClaims && !cachedNotifications) setDataLoading(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Initial data load is asynchronous; state updates happen after fetches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [mounted, loadDashboard]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  if (!user || !mounted) return null;

  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const activeClaims = claims.filter(
    (claim) => claim.displayStatus === "Pending" || claim.displayStatus === "QR Ready",
  ).length;
  const returnedThisWeek = claims.filter(
    (claim) =>
      claim.displayStatus === "Collected" &&
      !!claim.approvedAt &&
      new Date(claim.approvedAt).getTime() >= weekAgo,
  ).length;

  const stats = [
    { label: "Total Found Items", value: dataLoading ? "—" : String(items.length), icon: Package, color: "#355C8A" },
    { label: "Active Claims", value: dataLoading ? "—" : String(activeClaims), icon: FileText, color: "#7FB8B5" },
    { label: "Returned This Week", value: dataLoading ? "—" : String(returnedThisWeek), icon: RefreshCw, color: "#29486A" },
  ];

  const latestItems = items.filter((item) => !item.reportedByMe).slice(0, 4);
  const latestClaims = claims.slice(0, 4);
  const announcements = notifications.slice(0, 3).map((notification) => {
    const meta = NOTIFICATION_META[notification.type] || NOTIFICATION_META.SYSTEM;
    return {
      id: notification.id,
      title: notification.title,
      desc: notification.message,
      time: relativeTime(notification.createdAt),
      icon: meta.icon,
      color: meta.color,
      link: notification.link,
    };
  });

  function openAnnouncement(announcement: { link: string | null; title: string; desc: string }) {
    const link = resolveNotificationLink(announcement.link, announcement.title, announcement.desc);
    router.push(link || "/dashboard/student/notifications");
  }

  return (
    <StudentShell active="Home" userName={user.name} userRole={user.role} pageTitle="Dashboard" logout={handleLogout}>
      <main className="bg-white pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full bg-white">
          <VContentPanel>
          {dataError && (
            <VCard className="mb-4 flex flex-wrap items-center gap-3 p-4" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
              <AlertCircle size={18} style={{ color: c.danger }} />
              <p className="min-w-0 flex-1 text-sm" style={{ color: c.danger }}>{dataError}</p>
              <VButton variant="secondary" size="sm" onClick={() => void loadDashboard()}>
                <RefreshCw size={13} /> Retry
              </VButton>
            </VCard>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {stats.map((s) => (
              <VCard key={s.label} className="p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `color-mix(in srgb, ${s.color} 8%, transparent)` }}>
                  <s.icon size={20} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: c.text }}>{s.value}</p>
                  <p className="text-sm" style={{ color: c.textMuted }}>{s.label}</p>
                </div>
              </VCard>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            {/* Latest Found Items */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className={f.sectionTitle} style={{ color: c.text }}>Latest Found Items</h2>
                <button className="text-sm font-medium flex items-center gap-1 transition-opacity duration-200 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => router.push("/dashboard/student/search")}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {dataLoading && latestItems.length === 0
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <VCard key={`item-skeleton-${index}`} className="p-4 lg:p-5 animate-pulse">
                        <div className="w-full h-32 lg:h-40 rounded-xl mb-3" style={{ backgroundColor: c.fill }} />
                        <div className="h-4 w-2/3 rounded mb-2" style={{ backgroundColor: c.fill }} />
                        <div className="h-3 w-1/2 rounded" style={{ backgroundColor: c.fill }} />
                      </VCard>
                    ))
                  : latestItems.map((item) => (
                      <VCard key={item.id} className="p-4 lg:p-5 flex flex-col transition-all duration-200 hover:shadow-md">
                        <div className="w-full h-32 lg:h-40 rounded-xl mb-3 flex items-center justify-center cursor-pointer relative overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}
                          onClick={() => viewItemDetails(item.name)}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <>
                              <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                              <Package size={32} style={{ color: c.primary, opacity: 0.6 }} />
                            </>
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm lg:text-base font-semibold cursor-pointer hover:opacity-80" style={{ color: c.text }} onClick={() => viewItemDetails(item.name)}>{item.name}</h3>
                          <VBadge color={item.color}>{item.statusLabel}</VBadge>
                        </div>
                        <p className="text-xs lg:text-sm flex items-center gap-1" style={{ color: c.textMuted }}><MapPin size={12} /> {item.location || "—"}</p>
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: c.textMuted }}><Clock size={12} /> <time className="vq-date">{formatDisplayDate(item.date)}</time> · {item.category}</p>
                        <div className="mt-3">
                          <button type="button"
                            className="w-full h-9 lg:h-10 rounded-xl text-xs lg:text-sm font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                            style={{ borderColor: c.border, color: c.textMuted }}
                            onClick={() => viewItemDetails(item.name)}>
                            <Eye size={13} /> View Details
                          </button>
                        </div>
                      </VCard>
                    ))}
                {!dataLoading && latestItems.length === 0 && (
                  <VCard className="sm:col-span-2 p-8 text-center">
                    <Package size={32} className="mx-auto mb-3" style={{ color: c.textLight }} />
                    <p className="text-sm font-medium" style={{ color: c.textMuted }}>No other found items yet</p>
                    <p className="text-xs mt-1" style={{ color: c.textLight }}>Items you handed in stay in My Reports. Other found items will appear here after staff add them.</p>
                  </VCard>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="flex h-full flex-col gap-6">
              {/* My Claims */}
              <section className="flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>My Claims</h2>
                  <button type="button" className="text-sm font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer" style={{ color: c.primary }} onClick={() => router.push("/dashboard/student/claims")}>
                    View all <ChevronRight size={14} />
                  </button>
                </div>
              <VCard className="p-5 lg:p-6 min-h-[276px] lg:min-h-[316px] flex flex-col">
                <div className="flex flex-1 flex-col gap-3">
                  {latestClaims.map((claim) => (
                    <button key={claim.id} type="button"
                      onClick={() => router.push("/dashboard/student/claims")}
                      className="flex w-full items-center justify-between p-2.5 lg:p-3 rounded-xl transition-colors duration-200 hover:bg-[#dbe4ee] cursor-pointer"
                      style={{ backgroundColor: c.borderLight }}>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm lg:text-base font-medium truncate" style={{ color: c.text }}>{claim.itemName}</p>
                      </div>
                      <VBadge color={CLAIM_STATUS_COLOR[claim.displayStatus]} className="ml-2 shrink-0">{claim.displayStatus}</VBadge>
                    </button>
                  ))}
                  {!dataLoading && latestClaims.length === 0 && (
                    <div className="flex flex-1 items-center justify-center py-4">
                      <p className="text-xs" style={{ color: c.textLight }}>No claims yet.</p>
                    </div>
                  )}
                </div>
              </VCard>
              </section>

              {/* Announcements */}
              <section className="flex flex-1 flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>Announcements</h2>
                  <button type="button" className="text-sm font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer" style={{ color: c.primary }} onClick={() => router.push("/dashboard/student/notifications")}>
                    View all <ChevronRight size={14} />
                  </button>
                </div>
              <VCard className="p-5 lg:p-6 flex flex-1 flex-col min-h-[264px] lg:min-h-[294px]">
                <div className="divide-y flex-1" style={{ borderColor: c.border }}>
                  {announcements.map((announcement) => (
                    <button key={announcement.id} type="button" onClick={() => openAnnouncement(announcement)}
                      className="flex w-full gap-3 py-2.5 first:pt-0 last:pb-0 text-left rounded-lg transition-colors duration-150 hover:bg-[#f8fafc] cursor-pointer">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: c.borderLight }}>
                        <announcement.icon size={15} style={{ color: announcement.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1" style={{ color: c.text }}>{announcement.title}</p>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: c.textMuted }}>{announcement.desc}</p>
                        <p className="vq-date mt-0.5" style={{ color: c.textMuted }}>{announcement.time}</p>
                      </div>
                    </button>
                  ))}
                  {!dataLoading && announcements.length === 0 && (
                    <div className="flex h-full items-center justify-center py-4">
                      <p className="text-xs" style={{ color: c.textLight }}>No announcements yet.</p>
                    </div>
                  )}
                </div>
              </VCard>
              </section>
            </div>
          </div>
          </VContentPanel>
        </div>
      </main>
    </StudentShell>
  );
}
