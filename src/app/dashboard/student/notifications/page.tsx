"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing, CheckCircle2, Package, QrCode, AlertCircle, FileText,
  Scan, MapPin, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import { VCard, VBadge, vcolors as c } from "@/components/ui/vault";

interface User { id: string; name: string; email: string; role: string; }

type Notif = {
  id: string;
  title: string;
  desc: string;
  time: string;
  icon: any;
  color: string;
  read: boolean;
  category: "All" | "Claims" | "Locker" | "System";
};

const initialNotifs: Notif[] = [
  { id: "1", title: "Claim Approved", desc: "Your claim for MacBook Pro 14\" has been approved. Get your QR code to collect it.", time: "2h ago", icon: CheckCircle2, color: "#7FB8B5", read: false, category: "Claims" },
  { id: "2", title: "Locker Assigned", desc: "Locker #A12 assigned for item pickup. You have 48 hours to collect.", time: "5h ago", icon: Package, color: "#355C8A", read: false, category: "Locker" },
  { id: "3", title: "QR Code Ready", desc: "Scan your QR at the kiosk to retrieve your item.", time: "1d ago", icon: QrCode, color: "#29486A", read: false, category: "Locker" },
  { id: "4", title: "Claim Under Review", desc: "Your claim for Brown Leather Wallet is under review.", time: "1d ago", icon: FileText, color: "#355C8A", read: true, category: "Claims" },
  { id: "5", title: "Report Received", desc: "Your found item report for Silver Samsung phone has been received.", time: "2d ago", icon: AlertCircle, color: "#7FB8B5", read: true, category: "System" },
  { id: "6", title: "Pickup Reminder", desc: "Reminder: Locker #B07 will expire in 12 hours. Please collect soon.", time: "2d ago", icon: Clock, color: "#dc2626", read: true, category: "Locker" },
  { id: "7", title: "New Item Matches Your Lost Report", desc: "A found item matching \"Black Adidas backpack\" was just reported.", time: "3d ago", icon: Package, color: "#355C8A", read: true, category: "System" },
  { id: "8", title: "Claim Rejected", desc: "Your claim for House Keys was rejected. Contact support for details.", time: "4d ago", icon: AlertCircle, color: "#dc2626", read: true, category: "Claims" },
];

const filters: Notif["category"][] = ["All", "Claims", "Locker", "System"];

export default function StudentNotifications() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>(initialNotifs);
  const [filter, setFilter] = useState<Notif["category"]>("All");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
      return;
    }
    setUser(JSON.parse(stored));
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out");
    router.push("/login?skip=1");
  }

  if (!user || !mounted) return null;

  const filtered = notifs.filter((n) => {
    if (filter !== "All" && n.category !== filter) return false;
    if (showUnreadOnly && n.read) return false;
    return true;
  });

  function markAsRead(id: string) {
    setNotifs(notifs.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  return (
    <StudentShell active="Notifications" userName={user.name} userRole={user.role} pageTitle="Notifications" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex rounded-xl border bg-white overflow-hidden" style={{ borderColor: c.border }}>
              {filters.map((f) => (
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
              className={`h-10 px-3.5 rounded-xl text-xs font-semibold border bg-white transition-all duration-200 cursor-pointer ${showUnreadOnly ? "shadow-sm" : ""}`}
              style={{
                borderColor: showUnreadOnly ? c.primary : c.border,
                color: showUnreadOnly ? c.primary : c.textMuted,
                backgroundColor: showUnreadOnly ? c.primarySoft : "#fff",
              }}
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}>
              Unread only
            </button>
          </div>

          {/* List */}
          <VCard className="flex-1 overflow-hidden flex flex-col">
            {filtered.length === 0 ? (
              <div className="py-20 text-center flex-1 flex flex-col items-center justify-center">
                <BellRing size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
                <p className="text-base font-medium" style={{ color: c.textMuted }}>No notifications</p>
                <p className="text-sm mt-1" style={{ color: c.textLight }}>You&apos;re all caught up.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: c.borderLight }}>
                {filtered.map((n) => (
                  <div key={n.id}
                    className="relative flex gap-4 px-5 lg:px-6 py-4 transition-colors duration-150 cursor-pointer hover:bg-[#f8fafc]"
                    onClick={() => markAsRead(n.id)}>
                    {!n.read && (
                      <span className="absolute left-2 top-5 w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />
                    )}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ml-1"
                      style={{ backgroundColor: `${n.color}15` }}>
                      <n.icon size={18} style={{ color: n.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold truncate" style={{ color: c.text }}>{n.title}</p>
                        <span className="text-[11px] whitespace-nowrap shrink-0" style={{ color: c.textLight }}>{n.time}</span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: c.textMuted }}>{n.desc}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: c.borderLight, color: c.textMuted }}>
                          {n.category}
                        </span>
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
