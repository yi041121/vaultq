"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck, ChevronRight } from "lucide-react";
import { colors } from "@/lib/design";
import { useEscapeKey } from "@/lib/use-escape-key";
import { NOTIFICATION_META, relativeTime, type NotificationType } from "@/lib/notification-ui";
import { getCachedNotifications, getCachedUnread } from "@/lib/student-cache";

interface BellNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

function NotificationRow({ n, onOpen }: { n: BellNotification; onOpen: (n: BellNotification) => void }) {
  const meta = NOTIFICATION_META[n.type] || NOTIFICATION_META.SYSTEM;
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className="w-full flex gap-3 px-4 py-3 text-left border-b last:border-0 transition-colors duration-150 cursor-pointer hover:bg-[#f8fafc]"
      style={{ borderColor: colors.borderLight }}
    >
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${meta.color}15` }}
      >
        <Icon size={15} style={{ color: meta.color }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold truncate" style={{ color: colors.text }}>{n.title}</span>
          <span className="text-[10px] whitespace-nowrap shrink-0" style={{ color: colors.textLight }}>
            {relativeTime(n.createdAt)}
          </span>
        </span>
        <span className="block text-[11px] leading-relaxed line-clamp-2 mt-0.5" style={{ color: colors.textMuted }}>
          {n.message}
        </span>
        <span className="flex items-center gap-1.5 mt-1">
          {!n.isRead && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.primary }} />}
          <span className="text-[10px] font-medium" style={{ color: meta.color }}>{meta.category}</span>
        </span>
      </span>
    </button>
  );
}

/** Bell with unread count and an expandable newest-notifications panel. */
export function NotificationBell({ role }: { role: string }) {
  const router = useRouter();
  const [unread, setUnread] = useState(() => getCachedUnread());
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellNotification[]>(() => (getCachedNotifications() ?? []).slice(0, 5));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function loadCount() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    try {
      const res = await fetch("/api/notifications?count=1", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setUnread(Number(data.data?.unreadCount || 0));
    } catch {
      // A missing badge is not worth interrupting the page.
    }
  }

  async function loadItems(silent = false) {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/notifications?limit=5", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load notifications");
      setItems(Array.isArray(data.data) ? (data.data as BellNotification[]).slice(0, 5) : []);
      setUnread(Number(data.unreadCount || 0));
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadCount();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadCount();
    };
    const onUpdate = () => void loadCount();
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("vaultq:notifications", onUpdate);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("vaultq:notifications", onUpdate);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // While the panel is open, keep its five newest rows current too.
  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadItems(true);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [open]);

  function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next) void loadItems();
  }

  async function markAsRead(n: BellNotification) {
    if (n.isRead) return;
    setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
    setUnread((prev) => Math.max(0, prev - 1));

    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`/api/notifications/${n.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to mark notification read");
      window.dispatchEvent(new Event("vaultq:notifications"));
    } catch {
      setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: false } : item)));
      setUnread((prev) => prev + 1);
    }
  }

  function openNotification(n: BellNotification) {
    void markAsRead(n);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    if (markingAll || unread === 0) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to mark notifications read");
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnread(0);
      window.dispatchEvent(new Event("vaultq:notifications"));
    } catch {
      // Leave the existing count/state; a retry is possible from the full page.
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200"
        style={{ backgroundColor: open ? colors.primarySoft : colors.borderLight }}
        onClick={togglePanel}
      >
        <Bell size={18} style={{ color: open ? colors.primary : colors.textMuted }} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ backgroundColor: "#dc2626" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-white shadow-xl"
          style={{ borderColor: colors.border }}
        >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: colors.borderLight }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: colors.text }}>Notifications</p>
                <p className="text-[11px]" style={{ color: colors.textMuted }}>
                  {unread > 0 ? `${unread} unread` : "You're all caught up"}
                </p>
              </div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={markingAll}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: colors.primary }}
                >
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain">
              {loading && items.length === 0 ? (
                <div className="px-4 py-3 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: colors.borderLight }} />
                      <div className="flex-1 space-y-2 pt-0.5">
                        <div className="h-3 w-3/4 rounded" style={{ backgroundColor: colors.borderLight }} />
                        <div className="h-2.5 w-full rounded" style={{ backgroundColor: colors.borderLight }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error && items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs font-medium" style={{ color: colors.textMuted }}>Could not load notifications</p>
                  <p className="text-[11px] mt-1" style={{ color: colors.textLight }}>{error}</p>
                  <button
                    type="button"
                    className="mt-3 h-8 px-3 rounded-lg text-[11px] font-semibold border bg-white cursor-pointer"
                    style={{ borderColor: colors.border, color: colors.primary }}
                    onClick={() => void loadItems()}
                  >
                    Try again
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <BellRing size={26} className="mx-auto mb-2" style={{ color: colors.textLight }} />
                  <p className="text-xs font-medium" style={{ color: colors.textMuted }}>No notifications</p>
                  <p className="text-[11px] mt-0.5" style={{ color: colors.textLight }}>You're all caught up.</p>
                </div>
              ) : (
                items.map((n) => <NotificationRow key={n.id} n={n} onOpen={openNotification} />)
              )}
            </div>

            {role !== "ADMIN" && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/dashboard/student/notifications");
                }}
                className="w-full flex items-center justify-center gap-1 border-t px-4 py-2.5 text-[11px] font-semibold transition-colors duration-150 cursor-pointer hover:bg-[#f8fafc]"
                style={{ borderColor: colors.borderLight, color: colors.primary }}
              >
                View all notifications <ChevronRight size={13} />
              </button>
            )}
        </div>
      )}
    </div>
  );
}
