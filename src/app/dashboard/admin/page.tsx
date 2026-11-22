"use client";
import { adminNav } from "@/lib/admin-nav";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { formatDisplayDate as formatDate } from "@/lib/date-format";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Users, Lock, AlertCircle,
  Grid3X3, ChevronRight, PackageSearch, RefreshCw, ChevronsLeftRight,
  Clock, Eye, MapPin,
} from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VCard, VContentPanel, VBadge, VButton, vcolors as c, font as f } from "@/components/ui/vault";
import { DescriptionBox } from "@/components/description-box";
import { fetchAdminData } from "@/lib/admin-data";
import { mapApiItem, type FoundItem } from "@/lib/item-mapper";
import { categoryIcon } from "@/lib/category-icons";
import { shortClaimReference } from "@/lib/claim-mapper";
import { relativeTime } from "@/lib/notification-ui";

interface User { id: string; name: string; email: string; role: string; }

interface AdminClaim {
  id: string;
  status: string;
  createdAt: string;
  source?: string | null;
  matchedReportId?: string | null;
  item?: { itemName?: string | null } | null;
  user?: { name?: string | null } | null;
}

interface AdminAccount { id: string; role: string; }
interface PendingIntake { id: string; itemName: string; createdAt: string; user?: { name?: string | null } | null; }


export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<FoundItem[]>([]);
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [intake, setIntake] = useState<PendingIntake[]>([]);
  const [lockers, setLockers] = useState<Array<{ id: string; status: string }>>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const token = getBrowserSessionKey();
    if (!token) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setDataError(null);
    try {
      const [itemsRes, claimsRes, accountsRes, intakeRes, lockersRes] = await Promise.all([
        fetchAdminData("/api/items?light=1", token),
        fetchAdminData("/api/claims?light=1", token),
        fetchAdminData("/api/accounts", token),
        fetchAdminData("/api/reports?light=1&type=FOUND&status=PENDING", token),
        fetchAdminData("/api/lockers", token),
      ]);
      const [itemsJson, claimsJson, accountsJson, intakeJson, lockersJson] = await Promise.all([
        itemsRes.json().catch(() => null),
        claimsRes.json().catch(() => null),
        accountsRes.json().catch(() => null),
        intakeRes.json().catch(() => null),
        lockersRes.json().catch(() => null),
      ]);
      if (!itemsRes.ok || !itemsJson?.success) throw new Error(itemsJson?.error || "Failed to load items");
      if (!claimsRes.ok || !claimsJson?.success) throw new Error(claimsJson?.error || "Failed to load claims");
      if (!accountsRes.ok || !accountsJson?.success) throw new Error(accountsJson?.error || "Failed to load accounts");
      if (!intakeRes.ok || !intakeJson?.success) throw new Error(intakeJson?.error || "Failed to load pending intake");
      if (!lockersRes.ok || !lockersJson?.success) throw new Error(lockersJson?.error || "Failed to load lockers");

      setItems((Array.isArray(itemsJson.data) ? itemsJson.data : []).map(mapApiItem));
      setClaims(Array.isArray(claimsJson.data) ? claimsJson.data : []);
      setAccounts(Array.isArray(accountsJson.data) ? accountsJson.data : []);
      setIntake(Array.isArray(intakeJson.data) ? intakeJson.data : []);
      setLockers((Array.isArray(lockersJson.data) ? lockersJson.data : []).map((locker: { id: string; status: string }) => ({
        id: locker.id,
        status: locker.status,
      })));
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Failed to load dashboard");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = getBrowserSessionKey();
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
    clearStoredBrowserSession();
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
    // Claims created by matching a lost report keep that origin, so the queue
    // can distinguish them from a direct claim on a found item.
    isLost: claim.source === "MATCH" || Boolean(claim.matchedReportId),
  }));

  const lockerCounts = { AVAILABLE: 0, OCCUPIED: 0, MAINTENANCE: 0 } as Record<string, number>;
  for (const locker of lockers) {
    if (locker.status in lockerCounts) lockerCounts[locker.status] += 1;
  }
  const stats = [
    { label: "Total Items", value: dataLoading ? "—" : String(items.length), icon: Package, color: "#355C8A" },
    { label: "Pending Claims", value: dataLoading ? "—" : String(pendingClaims.length), icon: FileText, color: "#dc2626" },
    { label: "Pending Intake", value: dataLoading ? "—" : String(intake.length), icon: PackageSearch, color: "#3f8b86" },
    { label: "Available Lockers", value: dataLoading ? "—" : String(lockerCounts.AVAILABLE), icon: Lock, color: "#4a9d6b" },
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
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
                <h2 id="recent-inventory-title" className={f.sectionTitle} style={{ color: c.text }}>Recent Inventory Items</h2>
                <button className="text-sm font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => router.push("/dashboard/admin/items")}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              <div role="region" aria-labelledby="recent-inventory-title" tabIndex={0}
                aria-describedby={recentItems.length > 1 ? "recent-inventory-hint" : undefined}
                className={`grid min-w-0 gap-4 rounded-xl px-1 py-1 -mx-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355C8A] ${!dataLoading && recentItems.length === 0 ? "grid-cols-1" : "grid-flow-col auto-cols-[85%] overflow-x-auto overscroll-x-contain snap-x snap-mandatory"} sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:snap-none`}
                style={{ scrollbarWidth: "thin", scrollbarColor: `${c.primary} ${c.fill}` }}>
                {dataLoading && recentItems.length === 0
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <VCard key={`recent-skeleton-${index}`} className="min-w-0 snap-start p-4 animate-pulse">
                        <div className="w-full h-28 rounded-xl mb-3" style={{ backgroundColor: c.fill }} />
                        <div className="h-4 w-2/3 rounded" style={{ backgroundColor: c.fill }} />
                      </VCard>
                    ))
                  : recentItems.map((item) => {
                      const CatIcon = categoryIcon(item.category);
                      return (
                      <VCard key={item.id} role="link" tabIndex={0} aria-label={`View inventory item ${item.name}`}
                        className="min-w-0 snap-start p-4 lg:p-5 flex flex-col transition-all duration-200 hover:shadow-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                        onClick={() => router.push(`/dashboard/admin/items?open=${encodeURIComponent(item.id)}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/dashboard/admin/items?open=${encodeURIComponent(item.id)}`);
                          }
                        }}>
                        <div className="w-full h-32 lg:h-40 rounded-xl mb-3 flex items-center justify-center relative overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <>
                              <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                              <CatIcon size={32} style={{ color: c.primary, opacity: 0.6 }} />
                            </>
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="min-w-0 flex-1 line-clamp-2 text-sm lg:text-base font-semibold [overflow-wrap:anywhere]" style={{ color: c.text }}>{item.name}</h3>
                          <VBadge color={item.color}>{item.statusLabel}</VBadge>
                        </div>
                        <p className="text-xs lg:text-sm flex items-center gap-1 [overflow-wrap:anywhere]" style={{ color: c.textMuted }}>
                          <MapPin size={12} className="shrink-0" /> {item.location || "—"}
                        </p>
                        <p className="text-xs mt-0.5 flex flex-wrap items-center gap-1" style={{ color: c.textMuted }}>
                          <Clock size={12} className="shrink-0" /> <time className="vq-date">{formatDate(item.date)}</time>
                          <span aria-hidden="true">·</span>
                          <CatIcon size={12} className="shrink-0" /> {item.category}
                        </p>
                        <DescriptionBox className="mt-3" contentClassName="line-clamp-3">
                          {item.description || "No description provided."}
                        </DescriptionBox>
                        <div className="mt-auto pt-3">
                          <button type="button"
                            className="w-full h-9 lg:h-10 rounded-xl text-xs lg:text-sm font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                            style={{ borderColor: c.border, color: c.textMuted }}
                            onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/admin/items?open=${encodeURIComponent(item.id)}`); }}>
                            <Eye size={13} /> View Details
                          </button>
                        </div>
                      </VCard>
                      );
                    })}
                {!dataLoading && recentItems.length === 0 && (
                  <VCard className="sm:col-span-2 p-8 text-center">
                    <Package size={30} className="mx-auto mb-2" style={{ color: c.textLight }} />
                    <p className="text-sm" style={{ color: c.textMuted }}>No found items in inventory.</p>
                  </VCard>
                )}
              </div>
              {recentItems.length > 1 && (
                <p id="recent-inventory-hint" className="mt-2 flex items-center justify-center gap-1.5 text-[11px] sm:hidden" style={{ color: c.textMuted }}>
                  <ChevronsLeftRight size={13} aria-hidden="true" /> Swipe left or right to browse
                </p>
              )}
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-6">
              <section className="flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>Pending Claims</h2>
                  <button type="button" className="text-sm font-medium flex items-center gap-1 cursor-pointer hover:opacity-70" style={{ color: c.primary }} onClick={() => router.push("/dashboard/admin/claims")}>
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                <VCard className="p-5 lg:p-6 min-h-[276px] flex flex-col">
                <div className="flex flex-1 flex-col gap-3">
                  {dataLoading && pendingQueue.length === 0 ? <div className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} /> : pendingQueue.map((claim) => (
                    <button key={claim.id} type="button" onClick={() => router.push(`/dashboard/admin/claims?open=${encodeURIComponent(claim.id)}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer hover:bg-[#dbe4ee]" style={{ backgroundColor: c.fill }}>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="block truncate text-sm font-semibold" style={{ color: c.text }}>{claim.item}</span>
                          {claim.isLost && <VBadge className="shrink-0" color="#b45309">Lost</VBadge>}
                        </span>
                        <span className="block text-xs mt-1" style={{ color: c.textMuted }}>{claim.student} · <span className="vq-date">{claim.time}</span> · {claim.reference}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0" style={{ color: c.textMuted }} />
                    </button>
                  ))}
                  {!dataLoading && pendingQueue.length === 0 && <p className="flex flex-1 items-center justify-center py-5 text-sm" style={{ color: c.textMuted }}>No claims waiting for verification.</p>}
                </div>
              </VCard>
              </section>
              <section className="flex flex-1 flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>Pending Intake</h2>
                  <button type="button" className="text-sm font-medium flex items-center gap-1 cursor-pointer hover:opacity-70" style={{ color: c.primary }} onClick={() => router.push("/dashboard/admin/reports")}>
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                <VCard className="p-5 lg:p-6 min-h-[276px] flex-1">
                <div className="space-y-3">
                  {dataLoading && intake.length === 0 ? <div className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} /> : intake.slice(0, 3).map((report) => (
                    <button key={report.id} type="button" onClick={() => router.push(`/dashboard/admin/reports?open=${encodeURIComponent(report.id)}`)}
                      className="w-full flex items-center gap-3 rounded-xl border p-3 text-left cursor-pointer hover:bg-[#f8fafc]" style={{ borderColor: c.borderLight }}>
                      <PackageSearch size={18} className="shrink-0" style={{ color: c.primary }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" style={{ color: c.text }}>{report.itemName}</span>
                        <span className="block text-xs mt-1" style={{ color: c.textMuted }}>{report.user?.name || "Student"} · <span className="vq-date">{relativeTime(report.createdAt)}</span></span>
                      </span>
                      <ChevronRight size={14} className="shrink-0" style={{ color: c.textMuted }} />
                    </button>
                  ))}
                  {!dataLoading && intake.length === 0 && <p className="text-sm text-center py-5" style={{ color: c.textMuted }}>No found reports waiting for intake.</p>}
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
