"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Download, RefreshCw } from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VButton, VCard, VContentPanel, VFilterButton, vcolors as c, font as f } from "@/components/ui/vault";
import { FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { CalendarPopover } from "@/components/date-calendar";
import { adminNav } from "@/lib/admin-nav";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { formatDisplayDate } from "@/lib/date-format";

interface Summary {
  items: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> };
  reports: { total: number; byType: Record<string, number>; byStatus: Record<string, number> };
  claims: { total: number; byStatus: Record<string, number>; byMonth: Record<string, number> };
  lockers: { total: number; byStatus: Record<string, number> };
  accounts: { total: number; byRole: Record<string, number>; active: number; inactive: number };
  audit: { total: number };
}

const EXPORTS: { type: string; label: string }[] = [
  { type: "items", label: "Inventory" },
  { type: "claims", label: "Claims" },
  { type: "reports", label: "Reports" },
  { type: "lockers", label: "Lockers" },
  { type: "accounts", label: "Accounts" },
  { type: "audit", label: "Activity" },
];

const COLORS = ["#355C8A", "#4a9d6b", "#b45309", "#64748b", "#3f8b86", "#7c3aed"];

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function BarList({ title, data, empty = "No data" }: { title: string; data: Record<string, number>; empty?: string }) {
  const rows = Object.entries(data);
  const max = Math.max(1, ...rows.map(([, count]) => count));

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3" style={{ color: c.text }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs py-3" style={{ color: c.textMuted }}>{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(([name, count], index) => (
            <div key={name}>
              <div className="flex items-center justify-between gap-2 mb-1 text-xs">
                <span className="truncate" style={{ color: c.textMuted }}>{labelize(name)}</span>
                <span className="font-semibold tabular-nums shrink-0" style={{ color: c.text }}>{count}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: c.fill }} role="img"
                aria-label={`${labelize(name)}: ${count}`}>
                <div className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.max(4, (count / max) * 100)}%`, backgroundColor: COLORS[index % COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthBars({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).slice(-8);
  if (rows.length === 0) return <p className="text-xs py-3" style={{ color: c.textMuted }}>No claims in this period</p>;
  const max = Math.max(1, ...rows.map(([, count]) => count));

  return (
    <div className="flex items-end gap-2 h-32" role="img" aria-label="Claims per month">
      {rows.map(([month, count]) => (
        <div key={month} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
          <span className="text-[10px] tabular-nums" style={{ color: c.text }}>{count}</span>
          <div className="w-full rounded-t-md" style={{ height: `${Math.max(6, (count / max) * 88)}px`, backgroundColor: c.primary }} />
          <span className="text-[10px] truncate w-full text-center" style={{ color: c.textMuted }}>{month.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromAnchor, setFromAnchor] = useState<HTMLElement | null>(null);
  const [toAnchor, setToAnchor] = useState<HTMLElement | null>(null);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
        return;
      } catch {
        // fall through to the default shape
      }
    }
    setUser({ name: "Admin User", role: "ADMIN" });
  }, []);

  const load = useCallback(async () => {
    const token = getBrowserSessionKey();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/reports/summary?${params.toString()}`, {
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to build the report");
      setSummary(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build the report");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleLogout() {
    clearStoredBrowserSession();
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  const exportHref = (type: string) => {
    const params = new URLSearchParams({ type });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/admin/reports/export?${params.toString()}`;
  };

  if (!user) return null;

  const dateLabel = (value: string) => (value ? formatDisplayDate(value) : "Select date");

  return (
    <StudentShell active="Reports" userName={user.name} userRole={user.role} pageTitle="Reports and Analytics" bottomNav={adminNav} logout={handleLogout}>
      <main className="bg-white pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full bg-white">
          <VContentPanel>
            <div className="mb-5">
              <h1 className={f.sectionTitle} style={{ color: c.text }}>Reports and Analytics</h1>
            </div>

            <FilterPanel
              search={<span className="sr-only">Report filters</span>}
              filters={
                <>
                  <div className="relative"
                    onPointerEnter={(event) => { if (event.pointerType === "mouse") { setFromAnchor(event.currentTarget); if (!fromOpen) setFromOpen(true); } }}>
                    <VFilterButton onPointerEnter={(event) => { if (event.pointerType === "mouse") event.currentTarget.focus(); }} active={!!from} className="justify-between w-full sm:w-auto sm:min-w-[160px]"
                      aria-haspopup="dialog" aria-expanded={fromOpen}
                      onClick={(event) => { setFromAnchor(event.currentTarget); setFromOpen((open) => !open); }}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Clock size={14} style={{ color: from ? c.primary : c.textMuted }} />
                        <span className="vq-date truncate">{from ? dateLabel(from) : "From date"}</span>
                      </span>
                      <ChevronDown size={13} style={{ color: from ? c.primary : c.textMuted }} />
                    </VFilterButton>
                    {fromOpen && (
                      <CalendarPopover anchor={fromAnchor} compact value={from}
                        onChange={(iso) => setFrom(iso)} onClose={() => setFromOpen(false)} />
                    )}
                  </div>

                  <div className="relative"
                    onPointerEnter={(event) => { if (event.pointerType === "mouse") { setToAnchor(event.currentTarget); if (!toOpen) setToOpen(true); } }}>
                    <VFilterButton onPointerEnter={(event) => { if (event.pointerType === "mouse") event.currentTarget.focus(); }} active={!!to} className="justify-between w-full sm:w-auto sm:min-w-[160px]"
                      aria-haspopup="dialog" aria-expanded={toOpen}
                      onClick={(event) => { setToAnchor(event.currentTarget); setToOpen((open) => !open); }}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Clock size={14} style={{ color: to ? c.primary : c.textMuted }} />
                        <span className="vq-date truncate">{to ? dateLabel(to) : "To date"}</span>
                      </span>
                      <ChevronDown size={13} style={{ color: to ? c.primary : c.textMuted }} />
                    </VFilterButton>
                    {toOpen && (
                      <CalendarPopover anchor={toAnchor} compact value={to}
                        onChange={(iso) => setTo(iso)} onClose={() => setToOpen(false)} />
                    )}
                  </div>
                </>
              }
              reset={<ResetFiltersButton disabled={!from && !to} onClick={() => { setFrom(""); setTo(""); }} />}
            />

            {error && (
              <VCard className="mb-4 flex flex-wrap items-center gap-3 p-4" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
                <p className="min-w-0 flex-1 text-sm" style={{ color: c.danger }}>{error}</p>
                <VButton variant="secondary" size="sm" onClick={() => void load()}>
                  <RefreshCw size={13} /> Retry
                </VButton>
              </VCard>
            )}

            {loading && !summary ? (
              <div className="grid md:grid-cols-2 gap-5" aria-busy="true" aria-label="Loading report">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-56 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} />
                ))}
              </div>
            ) : summary ? (
              <div className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <VCard className="p-5">
                    <BarList title="Inventory by status" data={summary.items.byStatus} />
                    <div className="mt-5">
                      <BarList title="Inventory by category" data={summary.items.byCategory} />
                    </div>
                  </VCard>
                  <VCard className="p-5">
                    <BarList title="Reports by type" data={summary.reports.byType} />
                    <div className="mt-5">
                      <BarList title="Reports by status" data={summary.reports.byStatus} />
                    </div>
                  </VCard>
                  <VCard className="p-5">
                    <BarList title="Claims by status" data={summary.claims.byStatus} />
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold mb-3" style={{ color: c.text }}>Claims per month</h3>
                      <MonthBars data={summary.claims.byMonth} />
                    </div>
                  </VCard>
                  <VCard className="p-5">
                    <BarList title="Lockers by status" data={summary.lockers.byStatus} />
                    <div className="mt-5">
                      <BarList title="Accounts by role" data={summary.accounts.byRole} />
                    </div>
                  </VCard>
                </div>

                <VCard className="p-5">
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <h3 className="text-sm font-semibold" style={{ color: c.text }}>Download reports</h3>
                    <p className="text-[11px]" style={{ color: c.textMuted }}>CSV exports follow the selected date range.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {EXPORTS.map((item) => (
                      <a key={item.type} href={exportHref(item.type)}
                        className="inline-flex items-center justify-between gap-2 h-10 px-3 rounded-lg border text-sm font-medium bg-white"
                        style={{ borderColor: c.border, color: c.text }}>
                        {item.label}
                        <Download size={14} style={{ color: c.primary }} />
                      </a>
                    ))}
                  </div>
                </VCard>
              </div>
            ) : null}
          </VContentPanel>
        </div>
      </main>
    </StudentShell>
  );
}
