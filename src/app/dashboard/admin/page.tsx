"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Users, Lock, AlertCircle,
  Grid3X3, ChevronRight, PackageSearch, RefreshCw,
} from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VCard, VContentPanel, VBadge, VButton, vcolors as c, font as f } from "@/components/ui/vault";
import { fetchAdminData } from "@/lib/admin-data";
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

interface AdminAccount { id: string; role: string; }
interface PendingIntake { id: string; itemName: string; createdAt: string; user?: { name?: string | null } | null; }

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
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [intake, setIntake] = useState<PendingIntake[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setDataError(null);
    try {
      const [itemsRes, claimsRes, accountsRes, intakeRes] = await Promise.all([
        fetchAdminData("/api/items?light=1", token),
        fetchAdminData("/api/claims?light=1", token),
        fetchAdminData("/api/accounts", token),
        fetchAdminData("/api/reports?light=1&type=FOUND&status=PENDING", token),
      ]);
      const [itemsJson, claimsJson, accountsJson, intakeJson] = await Promise.all([
        itemsRes.json().catch(() => null),
        claimsRes.json().catch(() => null),
        accountsRes.json().catch(() => null),
        intakeRes.json().catch(() => null),
      ]);
      if (!itemsRes.ok || !itemsJson?.success) throw new Error(itemsJson?.error || "Failed to load items");
      if (!claimsRes.ok || !claimsJson?.success) throw new Error(claimsJson?.error || "Failed to load claims");
      if (!accountsRes.ok || !accountsJson?.success) throw new Error(accountsJson?.error || "Failed to load accounts");
      if (!intakeRes.ok || !intakeJson?.success) throw new Error(intakeJson?.error || "Failed to load pending intake");

      setItems((Array.isArray(itemsJson.data) ? itemsJson.data : []).map(mapApiItem));
      setClaims(Array.isArray(claimsJson.data) ? claimsJson.data : []);
      setAccounts(Array.isArray(accountsJson.data) ? accountsJson.data : []);
      setIntake(Array.isArray(intakeJson.data) ? intakeJson.data : []);
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

  const pendingClaims = claims.filter((claim) => claim.status === "PENDING")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // The inventory list defaults to FOUND; exclude claimed/retrieved history.
  // /api/items returns newest inventory records first (createdAt descending).
  const recentItems = items.filter((item) => item.status === "FOUND").slice(0, 4);
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
    { label: "Pending Intake", value: dataLoading ? "—" : String(intake.length), icon: PackageSearch, color: "#3f8b86" },
    { label: "Total Users", value: dataLoading ? "—" : String(accounts.length), icon: Users, color: "#29486A" },
  ];

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
            {/* Inventory takes the wide left column, like Latest Found Items. */}
            <div className="lg:col-span-2">
              {/* Recent items */}
              <div className="flex items-center justify-between mb-4">
                <h2 className={f.sectionTitle} style={{ color: c.text }}>Recent Inventory Items</h2>
                <button className="text-sm font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => router.push("/dashboard/admin/items")}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {dataLoading && recentItems.length === 0
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <VCard key={`recent-skeleton-${index}`} className="p-4 animate-pulse">
                        <div className="w-full h-28 rounded-xl mb-3" style={{ backgroundColor: c.fill }} />
                        <div className="h-4 w-2/3 rounded" style={{ backgroundColor: c.fill }} />
                      </VCard>
                    ))
                  : recentItems.map((item) => (
                      <VCard key={item.id} role="link" tabIndex={0} aria-label={`View inventory item ${item.name}`}
                        className="p-5 flex flex-col cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                        onClick={() => router.push(`/dashboard/admin/items?open=${encodeURIComponent(item.id)}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/dashboard/admin/items?open=${encodeURIComponent(item.id)}`);
                          }
                        }}>
                        <div className="w-full h-36 lg:h-40 rounded-xl mb-3 flex items-center justify-center overflow-hidden"
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
                        <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>{formatDate(item.date)} · {item.category}</p>
                        <p className="text-sm mt-3 leading-relaxed line-clamp-3" style={{ color: c.textMuted }}>{item.description || "No description provided."}</p>
                      </VCard>
                    ))}
                {!dataLoading && recentItems.length === 0 && (
                  <VCard className="sm:col-span-2 p-8 text-center">
                    <Package size={30} className="mx-auto mb-2" style={{ color: c.textLight }} />
                    <p className="text-sm" style={{ color: c.textMuted }}>No found items in inventory.</p>
                  </VCard>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-6 lg:pt-11">
              <VCard className="p-5 lg:p-6 min-h-[276px] flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>Pending Claims</h2>
                  <button type="button" className="text-sm font-medium flex items-center gap-1 cursor-pointer hover:opacity-70" style={{ color: c.primary }} onClick={() => router.push("/dashboard/admin/claims")}>
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-3">
                  {dataLoading && pendingQueue.length === 0 ? <div className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} /> : pendingQueue.map((claim) => (
                    <button key={claim.id} type="button" onClick={() => router.push(`/dashboard/admin/claims?open=${encodeURIComponent(claim.id)}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer hover:bg-[#dbe4ee]" style={{ backgroundColor: c.fill }}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate" style={{ color: c.text }}>{claim.item}</span>
                        <span className="block text-xs mt-1" style={{ color: c.textMuted }}>{claim.student} · {claim.time} · {claim.reference}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0" style={{ color: c.textMuted }} />
                    </button>
                  ))}
                  {!dataLoading && pendingQueue.length === 0 && <p className="flex flex-1 items-center justify-center py-5 text-sm" style={{ color: c.textMuted }}>No claims waiting for verification.</p>}
                </div>
              </VCard>
              <VCard className="p-5 lg:p-6 min-h-[276px] flex-1">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>Pending Intake</h2>
                  <button type="button" className="text-sm font-medium flex items-center gap-1 cursor-pointer hover:opacity-70" style={{ color: c.primary }} onClick={() => router.push("/dashboard/admin/reports")}>
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                <div className="space-y-3">
                  {dataLoading && intake.length === 0 ? <div className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} /> : intake.slice(0, 3).map((report) => (
                    <button key={report.id} type="button" onClick={() => router.push(`/dashboard/admin/reports?open=${encodeURIComponent(report.id)}`)}
                      className="w-full flex items-center gap-3 rounded-xl border p-3 text-left cursor-pointer hover:bg-[#f8fafc]" style={{ borderColor: c.borderLight }}>
                      <PackageSearch size={18} className="shrink-0" style={{ color: c.primary }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" style={{ color: c.text }}>{report.itemName}</span>
                        <span className="block text-xs mt-1" style={{ color: c.textMuted }}>{report.user?.name || "Student"} · {relativeTime(report.createdAt)}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0" style={{ color: c.textMuted }} />
                    </button>
                  ))}
                  {!dataLoading && intake.length === 0 && <p className="text-sm text-center py-5" style={{ color: c.textMuted }}>No found reports waiting for intake.</p>}
                </div>
              </VCard>
            </div>
          </div>
          </VContentPanel>
        </div>
      </main>

    </StudentShell>
  );
}
