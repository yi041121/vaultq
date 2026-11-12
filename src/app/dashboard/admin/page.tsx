"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Users, Lock, AlertCircle,
  Grid3X3, ChevronRight, X, PackageSearch, RefreshCw,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { StudentShell } from "@/components/student-shell";
import { VCard, VContentPanel, VBadge, VButton, vcolors as c, font as f } from "@/components/ui/vault";
import { useEscapeKey } from "@/lib/use-escape-key";
import { fetchAdminData, invalidateAdminData } from "@/lib/admin-data";
import { mapApiItem, type FoundItem } from "@/lib/item-mapper";
import { shortClaimReference } from "@/lib/claim-mapper";
import { relativeTime } from "@/lib/notification-ui";

interface User { id: string; name: string; email: string; role: string; }

interface AdminClaim {
  id: string;
  status: string;
  createdAt: string;
  item?: { itemName?: string | null } | null;
  user?: { name?: string | null } | null;
}

interface AdminLocker {
  id: string;
  lockerNumber: string;
  status: string;
  item?: { id: string } | null;
}

interface AdminAccount { id: string; role: string; }

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Intake", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<FoundItem[]>([]);
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [lockers, setLockers] = useState<AdminLocker[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [assignLocker, setAssignLocker] = useState<{ id: string; number: string } | null>(null);
  const [assignItemId, setAssignItemId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  useEscapeKey(!!assignLocker, () => setAssignLocker(null));

  const loadDashboard = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setDataError(null);
    try {
      const [itemsRes, claimsRes, lockersRes, accountsRes] = await Promise.all([
        fetchAdminData("/api/items?light=1", token),
        fetchAdminData("/api/claims?light=1", token),
        fetchAdminData("/api/lockers?light=1", token),
        fetchAdminData("/api/accounts", token),
      ]);
      const [itemsJson, claimsJson, lockersJson, accountsJson] = await Promise.all([
        itemsRes.json().catch(() => null),
        claimsRes.json().catch(() => null),
        lockersRes.json().catch(() => null),
        accountsRes.json().catch(() => null),
      ]);
      if (!itemsRes.ok || !itemsJson?.success) throw new Error(itemsJson?.error || "Failed to load items");
      if (!claimsRes.ok || !claimsJson?.success) throw new Error(claimsJson?.error || "Failed to load claims");
      if (!lockersRes.ok || !lockersJson?.success) throw new Error(lockersJson?.error || "Failed to load lockers");
      if (!accountsRes.ok || !accountsJson?.success) throw new Error(accountsJson?.error || "Failed to load accounts");

      setItems((Array.isArray(itemsJson.data) ? itemsJson.data : []).map(mapApiItem));
      setClaims(Array.isArray(claimsJson.data) ? claimsJson.data : []);
      setLockers(Array.isArray(lockersJson.data) ? lockersJson.data : []);
      setAccounts(Array.isArray(accountsJson.data) ? accountsJson.data : []);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Failed to load dashboard");
    } finally {
      setDataLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!mounted) return;
    void loadDashboard();
  }, [mounted, loadDashboard]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  if (!user || !mounted) return null;

  const pendingClaims = claims.filter((claim) => claim.status === "PENDING");
  const availableLockers = lockers.filter((locker) => locker.status === "AVAILABLE");
  const unassignedItems = items.filter((item) => item.status === "FOUND" && !item.locker);
  const recentItems = items.slice(0, 6);
  const pendingQueue = pendingClaims.slice(0, 3).map((claim) => ({
    id: claim.id,
    reference: shortClaimReference(claim.id),
    item: claim.item?.itemName || "Unknown item",
    student: claim.user?.name || "Student",
    time: relativeTime(claim.createdAt),
  }));

  const stats = [
    { label: "Total Items", value: dataLoading ? "—" : String(items.length), icon: Package, color: "#355C8A" },
    { label: "Pending Claims", value: dataLoading ? "—" : String(pendingClaims.length), icon: FileText, color: "#dc2626" },
    { label: "Available Lockers", value: dataLoading ? "—" : `${availableLockers.length}/${lockers.length}`, icon: Lock, color: "#7FB8B5" },
    { label: "Total Users", value: dataLoading ? "—" : String(accounts.length), icon: Users, color: "#29486A" },
  ];

  async function handleAssign() {
    if (!assignLocker || !assignItemId || assigning) {
      if (!assignItemId) showCenteredMessage("error", "Select an item");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;
    setAssigning(true);
    try {
      const response = await fetch(`/api/lockers/${assignLocker.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: assignItemId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Failed to assign item");
      invalidateAdminData();
      showCenteredMessage("success", "Item assigned", `Locker ${assignLocker.number} is now occupied.`);
      setAssignLocker(null);
      setAssignItemId("");
      void loadDashboard();
    } catch (error) {
      showCenteredMessage("error", error instanceof Error ? error.message : "Failed to assign item");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <StudentShell active="Dashboard" userName={user.name} userRole={user.role} pageTitle="Admin Dashboard" bottomNav={adminNav} logout={handleLogout}>
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

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {stats.map((s) => (
              <VCard key={s.label} className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `color-mix(in srgb, ${s.color} 8%, transparent)` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: c.text }}>{s.value}</p>
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
                  {dataLoading && pendingQueue.length === 0
                    ? Array.from({ length: 3 }).map((_, index) => (
                        <div key={`queue-skeleton-${index}`} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} />
                      ))
                    : pendingQueue.map((claim) => (
                        <button key={claim.id} type="button" onClick={() => router.push(`/dashboard/admin/claims?open=${claim.id}`)}
                          className="w-full flex items-center justify-between p-3 lg:p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-md text-left"
                          style={{ borderColor: c.borderLight, backgroundColor: c.fill, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                          title="Open in Claim Verification">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm lg:text-base font-semibold truncate" style={{ color: c.text }}>{claim.item}</p>
                            <p className="text-xs lg:text-sm mt-0.5" style={{ color: c.textMuted }}>{claim.student} · {claim.time} · {claim.reference}</p>
                          </div>
                          <VBadge color="#64748b" className="ml-3 shrink-0">Pending</VBadge>
                        </button>
                      ))}
                  {!dataLoading && pendingQueue.length === 0 && (
                    <p className="text-sm py-6 text-center" style={{ color: c.textMuted }}>No claims waiting for verification.</p>
                  )}
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
                {dataLoading && recentItems.length === 0
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <VCard key={`recent-skeleton-${index}`} className="p-4 animate-pulse">
                        <div className="w-full h-28 rounded-xl mb-3" style={{ backgroundColor: c.fill }} />
                        <div className="h-4 w-2/3 rounded" style={{ backgroundColor: c.fill }} />
                      </VCard>
                    ))
                  : recentItems.map((item) => (
                      <VCard key={item.id} className="p-4 transition-all duration-200 hover:shadow-md">
                        <div className="w-full h-28 rounded-xl mb-3 flex items-center justify-center overflow-hidden"
                          style={{ backgroundColor: c.borderLight }}>
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            : <Package size={28} style={{ color: c.textMuted }} />}
                        </div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{item.name}</h3>
                          <VBadge color={item.color}>{item.statusLabel}</VBadge>
                        </div>
                        <p className="text-xs" style={{ color: c.textMuted }}>{item.location || "—"}</p>
                        <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>{formatDate(item.date)}</p>
                      </VCard>
                    ))}
                {!dataLoading && recentItems.length === 0 && (
                  <VCard className="sm:col-span-3 p-8 text-center">
                    <Package size={30} className="mx-auto mb-2" style={{ color: c.textLight }} />
                    <p className="text-sm" style={{ color: c.textMuted }}>No items have been registered yet.</p>
                  </VCard>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6 flex flex-col">
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
                  {availableLockers.slice(0, 9).map((locker) => (
                    <button key={locker.id} type="button" onClick={() => { setAssignLocker({ id: locker.id, number: locker.lockerNumber }); setAssignItemId(""); }}
                      className="rounded-xl border p-5 text-center flex flex-col items-center justify-center relative overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-md"
                      style={{ borderColor: c.borderLight, background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})`, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                      title={`Assign item to ${locker.lockerNumber}`}>
                      <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.2), transparent 60%)" }} />
                      <div className="relative w-2 h-2 rounded-full mb-2" style={{ backgroundColor: "#7FB8B5" }} />
                      <p className="relative text-base font-bold" style={{ color: c.text }}>{locker.lockerNumber}</p>
                      <p className="relative text-xs font-medium mt-1" style={{ color: c.textMuted }}>Available</p>
                    </button>
                  ))}
                </div>
                {!dataLoading && availableLockers.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: c.textMuted }}>No available lockers — view all to manage.</p>
                )}
              </VCard>
            </div>
          </div>
          </VContentPanel>
        </div>
      </main>

      {/* Assign item to locker */}
      {assignLocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" onClick={() => setAssignLocker(null)} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Assign to {assignLocker.number}</h3>
              <button type="button" onClick={() => setAssignLocker(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: c.textMuted }}>Select a found item to put inside this locker:</p>
            <div className="space-y-2 mb-4 max-h-60 overflow-auto">
              {unassignedItems.map((item) => (
                <button key={item.id} type="button" onClick={() => setAssignItemId(item.id)}
                  className="w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors duration-200 cursor-pointer"
                  style={{ borderColor: assignItemId === item.id ? c.primary : c.border, backgroundColor: assignItemId === item.id ? "#e6eef5" : "#fff" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: c.text }}>{item.name}</p>
                    <p className="text-xs" style={{ color: c.textMuted }}>{item.category} · {item.id.slice(-8)}</p>
                  </div>
                  {assignItemId === item.id && <div className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: c.primary }} />}
                </button>
              ))}
              {!dataLoading && unassignedItems.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: c.textMuted }}>No unassigned found items.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <VButton variant="secondary" onClick={() => setAssignLocker(null)}>Cancel</VButton>
              <VButton onClick={handleAssign} disabled={!assignItemId || assigning}>
                {assigning ? "Assigning..." : "Assign"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
