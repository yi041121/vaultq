"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing, CheckCircle2, Package, AlertCircle, FileText,
  Loader2, RefreshCw, CheckCheck,
} from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VCard, vcolors as c } from "@/components/ui/vault";

interface User { id: string; name: string; email: string; role: string; }

type NotificationType = "CLAIM" | "REPORT" | "LOCKER" | "SYSTEM";
type Filter = "All" | "Claims" | "Reports" | "Locker" | "System";

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
  category: Exclude<Filter, "All">;
  icon: typeof BellRing;
  color: string;
}

const FILTERS: Filter[] = ["All", "Claims", "Reports", "Locker", "System"];

const TYPE_META: Record<NotificationType, { category: Exclude<Filter, "All">; icon: typeof BellRing; color: string }> = {
  CLAIM: { category: "Claims", icon: CheckCircle2, color: "#7FB8B5" },
  REPORT: { category: "Reports", icon: FileText, color: "#355C8A" },
  LOCKER: { category: "Locker", icon: Package, color: "#29486A" },
  SYSTEM: { category: "System", icon: BellRing, color: "#64748b" },
};

function relativeTime(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 45_000) return "Just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function toNotif(raw: ApiNotification): Notif {
  const meta = TYPE_META[raw.type] || TYPE_META.SYSTEM;
  return {
    ...raw,
    category: meta.category,
    icon: meta.icon,
    color: meta.color,
  };
}

let notificationsCache: Notif[] | null = null;

export default function StudentNotifications() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>(notificationsCache ?? []);
  const [unreadCount, setUnreadCount] = useState(notificationsCache ? notificationsCache.filter((n) => !n.isRead).length : 0);
  const [filter, setFilter] = useState<Filter>("All");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(notificationsCache === null);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      setError("Session expired — please sign in again");
      return;
    }
    if (!notificationsCache) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load notifications");
      const list = (data.data as ApiNotification[]).map(toNotif);
      setNotifs(list);
      notificationsCache = list;
      setUnreadCount(Number(data.unreadCount ?? list.filter((n) => !n.isRead).length));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
      if (!notificationsCache) setNotifs([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (notificationsCache !== null) notificationsCache = notifs;
  }, [notifs]);

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

  function handleLogout() {
    notificationsCache = null;
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
        return true;
      }),
    [notifs, filter, showUnreadOnly],
  );

  if (!user || !mounted) return null;

  return (
    <StudentShell active="Notifications" userName={user.name} userRole={user.role} pageTitle="Notifications" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex rounded-xl border bg-white overflow-hidden" style={{ borderColor: c.border }}>
              {FILTERS.map((f) => (
                <button key={f} type="button"
                  className="px-3.5 h-10 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer"
                  style={{
                    backgroundColor: filter === f ? c.primary : "transparent",
                    color: filter === f ? "#fff" : c.textMuted,
                  }}
                  onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
            <button type="button"
              className="h-10 px-3.5 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer"
              style={{
                borderColor: showUnreadOnly ? c.primary : c.border,
                color: showUnreadOnly ? c.primary : c.textMuted,
                backgroundColor: showUnreadOnly ? c.primarySoft : "#fff",
              }}
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}>
              Unread only
            </button>

            <span className="text-xs ml-auto" style={{ color: c.textMuted }}>
              {unreadCount} unread · {notifs.length} total
            </span>
            <button type="button"
              className="h-10 px-3.5 rounded-xl text-xs font-semibold border bg-white transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: c.border, color: c.textMuted }}
              onClick={() => void load()} disabled={loading}>
              <RefreshCw size={13} className={`inline mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button type="button"
              className="h-10 px-3.5 rounded-xl text-xs font-semibold border bg-white transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: c.border, color: c.primary }}
              onClick={() => void markAllRead()} disabled={markingAll || unreadCount === 0}>
              {markingAll ? <Loader2 size={13} className="inline mr-1 animate-spin" /> : <CheckCheck size={13} className="inline mr-1" />}
              Mark all read
            </button>
          </div>

          {/* List */}
          <VCard className="flex-1 overflow-hidden flex flex-col">
            {loading ? null : error ? (
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
              <div className="divide-y" style={{ borderColor: c.borderLight }}>
                {filtered.map((n) => (
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
            )}
          </VCard>
        </div>
      </main>
    </StudentShell>
  );
}
