"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Users, Lock, CheckCircle2, Clock, AlertCircle,
  Shield, Grid3X3, PlusCircle, Search, QrCode, ChevronRight, BellRing, X, PackageSearch,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { StudentShell } from "@/components/student-shell";
import { VCard, VBadge, VButton, vcolors as c, font as f } from "@/components/ui/vault";

interface User { id: string; name: string; email: string; role: string; }

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Intake", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

const stats = [
  { label: "Total Items", value: "128", icon: Package, color: "#355C8A" },
  { label: "Pending Claims", value: "12", icon: FileText, color: "#dc2626" },
  { label: "Available Lockers", value: "18/24", icon: Lock, color: "#7FB8B5" },
  { label: "Total Users", value: "1,240", icon: Users, color: "#29486A" },
];

const allVerificationQueue = [
  { id: "CLM-001", item: "MacBook Pro 14\"", student: "Alex Tan", time: "2h ago", status: "Pending", color: "#64748b" },
  { id: "CLM-002", item: "Brown Leather Wallet", student: "Sarah Lim", time: "5h ago", status: "Pending", color: "#64748b" },
  { id: "CLM-003", item: "Student ID Card", student: "John Doe", time: "1d ago", status: "Pending", color: "#64748b" },
  { id: "CLM-004", item: "AirPods Pro", student: "Emily Chen", time: "1d ago", status: "Pending", color: "#64748b" },
  { id: "CLM-006", item: "House Keys (4 pcs)", student: "Lisa Wong", time: "2d ago", status: "Pending", color: "#64748b" },
];

const pendingClaims = allVerificationQueue.filter((c) => c.status === "Pending").slice(0, 3);

const recentItems = [
  { name: "AirPods Pro", category: "Electronics", location: "Library 3rd Floor", date: "24 Jul 2026", status: "Found", color: "#7FB8B5" },
  { name: "House Keys (4 pcs)", category: "Keys", location: "Bus Stop", date: "23 Jul 2026", status: "Found", color: "#7FB8B5" },
  { name: "Physics Notes Folder", category: "Documents", location: "Lecture Hall B", date: "22 Jul 2026", status: "Claimed", color: "#355C8A" },
  { name: "Blue Water Bottle", category: "Water Bottles", location: "Gymnasium", date: "19 Jul 2026", status: "Found", color: "#7FB8B5" },
  { name: "Brown Leather Wallet", category: "Bags", location: "Student Lounge", date: "23 Jul 2026", status: "Found", color: "#7FB8B5" },
  { name: "Student ID Card", category: "Student Cards", location: "Cafeteria", date: "21 Jul 2026", status: "Found", color: "#7FB8B5" },
];

const initialLockers = [
  { number: "A01", status: "Available", color: "#7FB8B5" },
  { number: "A02", status: "Occupied", color: "#355C8A" },
  { number: "A03", status: "Available", color: "#7FB8B5" },
  { number: "A04", status: "Maintenance", color: "#dc2626" },
  { number: "B01", status: "Available", color: "#7FB8B5" },
  { number: "B02", status: "Occupied", color: "#355C8A" },
  { number: "B03", status: "Available", color: "#7FB8B5" },
  { number: "B04", status: "Available", color: "#7FB8B5" },
  { number: "B05", status: "Available", color: "#7FB8B5" },
];

const mockUnassignedItems = [
  { id: "ITM-004", name: "Student ID Card", category: "Student Cards" },
  { id: "ITM-008", name: "Physics Notes Folder", category: "Documents" },
  { id: "ITM-009", name: "Blue Water Bottle", category: "Water Bottles" },
  { id: "ITM-010", name: "House Keys (4 pcs)", category: "Keys" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [lockerList, setLockerList] = useState(initialLockers);
  const [assignLocker, setAssignLocker] = useState<{ number: string; status: string } | null>(null);
  const [assignItemId, setAssignItemId] = useState<string>("");

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ id: "1", name: "Admin User", email: "admin@vaultq.edu", role: "ADMIN" });
      return;
    }
    setUser(JSON.parse(stored));
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  if (!user || !mounted) return null;

  const availableLockers = lockerList.filter((l) => l.status === "Available");

  function handleAssign() {
    if (!assignLocker || !assignItemId) {
      showCenteredMessage("error", "Select an item");
      return;
    }
    const item = mockUnassignedItems.find((it) => it.id === assignItemId);
    if (!item) return;
    setLockerList(lockerList.map((l) => l.number === assignLocker.number ? { ...l, status: "Occupied", color: "#355C8A" } : l));
    showCenteredMessage("success", `Assigned ${item.name} to ${assignLocker.number}`);
    setAssignLocker(null);
    setAssignItemId("");
  }

  const quickActions = [
    { label: "Verify Claims", icon: Shield, desc: "Review pending", path: "/dashboard/admin/claims" },
    { label: "Register Item", icon: PlusCircle, desc: "Add found item", path: "/dashboard/admin/items?add=1" },
    { label: "Manage Lockers", icon: Lock, desc: "Assign lockers", path: "/dashboard/admin/lockers" },
    { label: "Manage Accounts", icon: Users, desc: "Student accounts", path: "/dashboard/admin/accounts" },
  ];

  return (
    <StudentShell active="Dashboard" userName={user.name} userRole={user.role} pageTitle="Admin Dashboard" bottomNav={adminNav} logout={handleLogout}>
      <main className="pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {stats.map((s) => (
              <VCard key={s.label} className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${s.color}15` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold" style={{ color: c.text }}>{s.value}</p>
                  <p className="text-xs sm:text-sm leading-tight" style={{ color: c.textMuted }}>{s.label}</p>
                </div>
              </VCard>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Pending claims */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className={f.sectionTitle} style={{ color: c.text }}>Pending Verification</h2>
                <button className="text-sm font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => router.push("/dashboard/admin/claims")}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              <VCard className="p-5 lg:p-6">
                <div className="space-y-3">
                  {pendingClaims.map((cl) => (
                    <button key={cl.id} type="button" onClick={() => router.push(`/dashboard/admin/claims?open=${cl.id}`)}
                      className="w-full flex items-center justify-between p-3 lg:p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-md text-left"
                      style={{ borderColor: c.borderLight, backgroundColor: c.fill, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                      title="Open in Claim Verification">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm lg:text-base font-semibold truncate" style={{ color: c.text }}>{cl.item}</p>
                        <p className="text-xs lg:text-sm mt-0.5" style={{ color: c.textMuted }}>{cl.student} · {cl.time} · {cl.id}</p>
                      </div>
                      <VBadge color={cl.color} className="ml-3 shrink-0">{cl.status}</VBadge>
                    </button>
                  ))}
                </div>
              </VCard>

              {/* Recent items */}
              <div className="flex items-center justify-between mt-6 mb-4">
                <h2 className={f.sectionTitle} style={{ color: c.text }}>Recent Items</h2>
                <button className="text-sm font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => router.push("/dashboard/admin/items")}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {recentItems.map((item) => (
                  <VCard key={item.name} className="p-4 transition-all duration-200 hover:shadow-md">
                    <div className="w-full h-28 rounded-xl mb-3 flex items-center justify-center"
                      style={{ backgroundColor: c.borderLight }}>
                      <Package size={28} style={{ color: c.textMuted }} />
                    </div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{item.name}</h3>
                      <VBadge color={item.color}>{item.status}</VBadge>
                    </div>
                    <p className="text-xs" style={{ color: c.textMuted }}>{item.location}</p>
                    <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>{item.date}</p>
                  </VCard>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6 flex flex-col">
              <VCard className="p-5 lg:mt-9">
                <h2 className={f.sectionTitle} style={{ color: c.text, marginBottom: "12px" }}>Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((a) => (
                    <button key={a.label} type="button"
                      className="flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium h-28 border relative overflow-hidden transition-all duration-200 cursor-pointer"
                      style={{ borderColor: c.borderLight, background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)`, color: c.textMuted, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.06)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.03)"; }}
                      onClick={() => a.path && router.push(a.path)}>
                      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.2), transparent 60%)" }} />
                      <a.icon size={16} className="relative" style={{ color: c.primary }} />
                      <span className="relative">{a.label}</span>
                    </button>
                  ))}
                </div>
              </VCard>

              <div className="flex items-center justify-between mb-4 lg:mt-11">
                <h2 className={f.sectionTitle} style={{ color: c.text }}>Available Lockers</h2>
                <button className="text-sm font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => router.push("/dashboard/admin/lockers")}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              <VCard className="p-5 flex-1 flex flex-col">
                <div className="grid grid-cols-3 gap-3 flex-1 auto-rows-fr">
                  {availableLockers.map((l) => (
                    <button key={l.number} type="button" onClick={() => { setAssignLocker(l); setAssignItemId(""); }}
                      className="rounded-xl border p-5 text-center flex flex-col items-center justify-center relative overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-md"
                      style={{ borderColor: c.borderLight, background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)`, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                      title={`Assign item to ${l.number}`}>
                      <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.2), transparent 60%)" }} />
                      <div className="relative w-2 h-2 rounded-full mb-2" style={{ backgroundColor: l.color }} />
                      <p className="relative text-base font-bold" style={{ color: c.text }}>{l.number}</p>
                      <p className="relative text-xs font-medium mt-1" style={{ color: c.textMuted }}>{l.status}</p>
                    </button>
                  ))}
                </div>
                {availableLockers.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: c.textMuted }}>No available lockers — view all to manage.</p>
                )}
              </VCard>
            </div>
          </div>
        </div>
      </main>

      {/* Assign item to locker */}
      {assignLocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setAssignLocker(null)} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Assign to {assignLocker.number}</h3>
              <button type="button" onClick={() => setAssignLocker(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: c.textMuted }}>Select a found item to put inside this locker:</p>
            <div className="space-y-2 mb-4 max-h-60 overflow-auto">
              {mockUnassignedItems.map((it) => (
                <button key={it.id} type="button" onClick={() => setAssignItemId(it.id)}
                  className="w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors duration-200 cursor-pointer"
                  style={{ borderColor: assignItemId === it.id ? c.primary : c.border, backgroundColor: assignItemId === it.id ? "#e6eef5" : "#fff" }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: c.text }}>{it.name}</p>
                    <p className="text-xs" style={{ color: c.textMuted }}>{it.category} · {it.id}</p>
                  </div>
                  {assignItemId === it.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <VButton variant="secondary" onClick={() => setAssignLocker(null)}>Cancel</VButton>
              <VButton onClick={handleAssign} disabled={!assignItemId}>Assign</VButton>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
