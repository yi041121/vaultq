"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, AlertCircle, Loader2, RefreshCw, CheckCheck } from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VCard, VSearchInput, VFilterButton, VBadge, VPagination, vcolors as c } from "@/components/ui/vault";
import { FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { MobileOnly, DesktopOnly } from "@/components/responsive";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import {
  NOTIFICATION_META, relativeTime,
  type NotificationCategory, type NotificationType,
} from "@/lib/notification-ui";
import { matchesSearch } from "@/lib/search";
import {
  clearStudentCache, getCachedNotifications, getCachedUnread,
  setCachedNotifications, type CachedNotification,
} from "@/lib/student-cache";

interface User { id: string; name: string; email: string; role: string; }

type Filter = "All" | NotificationCategory;

interface ApiNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface Notif extends ApiNotification {
  category: NotificationCategory;
  icon: typeof BellRing;
  color: string;
}

const FILTERS: Filter[] = ["All", "Claims", "Reports", "Locker", "System"];

function toNotif(raw: ApiNotification): Notif {
  const meta = NOTIFICATION_META[raw.type] || NOTIFICATION_META.SYSTEM;
  return {
    ...raw,
    category: meta.category,
    icon: meta.icon,
    color: meta.color,
  };
}

export default function StudentNotifications() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>(() => (getCachedNotifications() ?? []).map(toNotif));
  const [unreadCount, setUnreadCount] = useState(() => getCachedUnread());
  const [filter, setFilter] = useState<Filter>("All");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(() => getCachedNotifications() === null);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const inFlight = useRef(false);
  const pageSize = 8;

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      setError("Session expired — please sign in again");
      inFlight.current = false;
      return;
    }
    if (!silent && !getCachedNotifications()) setLoading(true);
    if (!silent) setError(null);
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load notifications");
      const raw = data.data as CachedNotification[];
      const list = raw.map(toNotif);
      setNotifs(list);
      const unread = Number(data.unreadCount ?? list.filter((n) => !n.isRead).length);
      setUnreadCount(unread);
      setCachedNotifications(raw, unread);
    } catch (e) {
      // Background refreshes keep the last good list on screen.
      if (!silent) {
        setError(e instanceof Error ? e.message : "Failed to load notifications");
        if (!getCachedNotifications()) setNotifs([]);
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    setCachedNotifications(notifs, unreadCount);
  }, [notifs, unreadCount]);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
      setLoading(false);
      setError("Session expired — please sign in again");
      return;
    }
    setUser(JSON.parse(stored));
    void load();
  }, [load]);

  // Notifications update automatically; no manual Refresh button.
  useEffect(() => {
    if (!mounted) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const interval = window.setInterval(refresh, 10_000);
    const onFocus = () => refresh();
    const onUpdate = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("vaultq:notifications", onUpdate);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("vaultq:notifications", onUpdate);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [mounted, load]);

  useEffect(() => {
    setPage(1);
  }, [filter, showUnreadOnly, query]);

  function handleLogout() {
    clearStudentCache();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  async function markAsRead(id: string) {
    const target = notifs.find((n) => n.id === id);
    if (!target || target.isRead) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    window.dispatchEvent(new Event("vaultq:notifications"));

    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
        setUnreadCount((prev) => prev + 1);
        window.dispatchEvent(new Event("vaultq:notifications"));
      }
    } catch {
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
      setUnreadCount((prev) => prev + 1);
      window.dispatchEvent(new Event("vaultq:notifications"));
    }
  }

  async function markAllRead() {
    if (markingAll || unreadCount === 0) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        window.dispatchEvent(new Event("vaultq:notifications"));
      }
    } finally {
      setMarkingAll(false);
    }
  }

  function openNotification(n: Notif) {
    void markAsRead(n.id);
    if (n.link) router.push(n.link);
  }

  const filtered = useMemo(
    () =>
      notifs.filter((n) => {
        if (filter !== "All" && n.category !== filter) return false;
        if (showUnreadOnly && n.isRead) return false;
        if (query.trim() && !matchesSearch(query, [n.title, n.message, n.category])) return false;
        return true;
      }),
    [notifs, filter, showUnreadOnly, query],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = !!query.trim() || filter !== "All" || showUnreadOnly;
  const resetFilters = () => { setQuery(""); setFilter("All"); setShowUnreadOnly(false); setPage(1); };

  const notificationColumns: DataTableColumn<Notif>[] = [
    {
      key: "type",
      header: "Type",
      cell: (n) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${n.color}15` }}>
            <n.icon size={15} style={{ color: n.color }} />
          </div>
          <span className="text-xs font-medium" style={{ color: c.textMuted }}>{n.category}</span>
        </div>
      ),
    },
    {
      key: "notification",
      header: "Notification",
      cell: (n) => (
        <div className="min-w-0 max-w-[420px]">
          <p className="text-sm font-semibold truncate" style={{ color: c.text }}>{n.title}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: c.textMuted }}>{n.message}</p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (n) => <span className="text-xs whitespace-nowrap" style={{ color: c.textMuted }}>{relativeTime(n.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (n) => n.isRead
        ? <span className="text-xs" style={{ color: c.textLight }}>Read</span>
        : <VBadge color={c.primary}>Unread</VBadge>,
    },
  ];

  if (!user || !mounted) return null;

  return (
    <StudentShell active="Notifications" userName={user.name} userRole={user.role} pageTitle="Notifications" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-28 lg:pb-6">
        <div className="px-4 sm:px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          <FilterPanel
            search={
              <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="w-full" placeholder="Search notifications..." />
            }
            filters={
              <>
                {FILTERS.map((f) => (
                  <VFilterButton key={f} active={filter === f} onClick={() => { setFilter(f); setPage(1); }}>
                    {f}
                  </VFilterButton>
                ))}
                <VFilterButton active={showUnreadOnly} onClick={() => { setShowUnreadOnly(!showUnreadOnly); setPage(1); }}>
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: showUnreadOnly ? c.primary : c.textLight }} />
                  </span>
                  Unread only
                </VFilterButton>
              </>
            }
            reset={hasFilters ? <ResetFiltersButton onClick={resetFilters} /> : null}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 mb-6"
            style={{ borderColor: c.border }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: c.textMuted }}>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: c.accent }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: c.accent }} />
                </span>
                Auto-updating
              </span>
              <span className="text-xs" style={{ color: c.textMuted }}>
                {unreadCount} unread · {notifs.length} total
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button"
                className="h-9 px-3 rounded-lg text-xs font-semibold border bg-white transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: c.border, color: c.primary }}
                onClick={() => void markAllRead()} disabled={markingAll || unreadCount === 0}>
                {markingAll ? <Loader2 size={13} className="inline mr-1 animate-spin" /> : <CheckCheck size={13} className="inline mr-1" />}
                Mark all read
              </button>
            </div>
          </div>

          {/* List */}
          <MobileOnly className="flex-1 flex flex-col">
          <VCard className="flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <div className="divide-y" style={{ borderColor: c.borderLight }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 px-5 py-4 animate-pulse">
                    <div className="w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: c.fill }} />
                    <div className="flex-1 space-y-2 py-0.5">
                      <div className="h-3.5 w-2/3 rounded" style={{ backgroundColor: c.fill }} />
                      <div className="h-3 w-full rounded" style={{ backgroundColor: c.fill }} />
                      <div className="h-3 w-4/5 rounded" style={{ backgroundColor: c.fill }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="py-20 text-center flex-1 flex flex-col items-center justify-center">
                <AlertCircle size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
                <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load notifications</p>
                <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{error}</p>
                <button type="button"
                  className="h-10 px-4 rounded-xl text-sm font-semibold border bg-white cursor-pointer"
                  style={{ borderColor: c.border, color: c.primary }}
                  onClick={() => void load()}>
                  <RefreshCw size={14} className="inline mr-1.5" /> Try again
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center flex-1 flex flex-col items-center justify-center">
                <BellRing size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
                <p className="text-base font-medium" style={{ color: c.textMuted }}>No notifications</p>
                <p className="text-sm mt-1" style={{ color: c.textLight }}>
                  {notifs.length === 0 ? "You're all caught up." : "Nothing matches these filters."}
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y flex-1" style={{ borderColor: c.borderLight }}>
                  {paginated.map((n) => (
                  <div key={n.id}
                    className="relative flex gap-4 px-5 lg:px-6 py-4 transition-colors duration-150 cursor-pointer hover:bg-[#f8fafc]"
                    onClick={() => openNotification(n)}>
                    {!n.isRead && (
                      <span className="absolute left-2 top-5 w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />
                    )}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ml-1"
                      style={{ backgroundColor: `${n.color}15` }}>
                      <n.icon size={18} style={{ color: n.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold truncate" style={{ color: c.text }}>{n.title}</p>
                        <span className="text-[11px] whitespace-nowrap shrink-0" style={{ color: c.textLight }}>{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: c.textMuted }}>{n.message}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: c.borderLight, color: c.textMuted }}>
                          {n.category}
                        </span>
                        {n.link && (
                          <span className="text-[11px] font-semibold" style={{ color: c.primary }}>
                            View details →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t"
                    style={{ borderColor: c.borderLight }}>
                    <p className="text-xs" style={{ color: c.textMuted }}>
                      Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
                    </p>
                    <VPagination current={currentPage} total={totalPages} onPage={setPage} />
                  </div>
                )}
              </>
            )}
          </VCard>
          </MobileOnly>
          <DesktopOnly>
            {error && notifs.length === 0 ? (
              <div className="rounded-2xl border bg-white py-16 px-6 text-center" style={{ borderColor: c.border }}>
                <AlertCircle size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
                <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load notifications</p>
                <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{error}</p>
                <button type="button"
                  className="h-10 px-4 rounded-xl text-sm font-semibold border bg-white cursor-pointer"
                  style={{ borderColor: c.border, color: c.primary }}
                  onClick={() => void load()}>
                  <RefreshCw size={14} className="inline mr-1.5" /> Try again
                </button>
              </div>
            ) : (
              <DataTable
                rows={paginated}
                columns={notificationColumns}
                rowKey={(n) => n.id}
                loading={loading}
                onRowClick={openNotification}
                empty={notifs.length === 0 ? "You're all caught up." : "Nothing matches these filters."}
              />
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 mt-3">
                <p className="text-xs" style={{ color: c.textMuted }}>
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
                </p>
                <VPagination current={currentPage} total={totalPages} onPage={setPage} />
              </div>
            )}
          </DesktopOnly>
        </div>
      </main>
    </StudentShell>
  );
}
