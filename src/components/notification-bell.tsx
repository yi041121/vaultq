"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { colors } from "@/lib/design";

/** Bell with a live unread count for the current user. */
export function NotificationBell({ role }: { role: string }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

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

  useEffect(() => {
    void loadCount();
    const onFocus = () => void loadCount();
    const onUpdate = () => void loadCount();
    window.addEventListener("focus", onFocus);
    window.addEventListener("vaultq:notifications", onUpdate);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("vaultq:notifications", onUpdate);
    };
  }, []);

  const target = role === "ADMIN" ? null : "/dashboard/student/notifications";

  return (
    <button
      type="button"
      aria-label="Notifications"
      className="relative w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200"
      style={{ backgroundColor: colors.borderLight }}
      onClick={() => { if (target) router.push(target); }}
    >
      <Bell size={18} style={{ color: colors.textMuted }} />
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
          style={{ backgroundColor: "#dc2626" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
