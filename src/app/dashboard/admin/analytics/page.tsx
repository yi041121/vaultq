"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Download, RefreshCw } from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VButton, VCard, VContentPanel, VFilterButton, vcolors as c } from "@/components/ui/vault";
import { ResetFiltersButton } from "@/components/filter-panel";
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

const BAR_COLORS = ["#355C8A", "#4a9d6b", "#b45309", "#64748b", "#3f8b86"];

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function BarList({ data, empty = "No data" }: { data: Record<string, number>; empty?: string }) {
  const rows = Object.entries(data);
  const max = Math.max(1, ...rows.map(([, count]) => count));
  if (rows.length === 0) return <p className="text-xs py-2" style={{ color: c.textMuted }}>{empty}</p>;
  return (
    <div className="space-y-2.5">
      {rows.map(([name, count], index) => (
        <div key={name}>
          <div className="flex items-center justify-between gap-2 mb-1 text-xs">
            <span className="truncate" style={{ color: c.textMuted }}>{labelize(name)}</span>
            <span className="font-semibold tabular-nums shrink-0" style={{ color: c.text }}>{count}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: c.fill }}
            role="img" aria-label={`${labelize(name)}: ${count}`}>
            <div className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${Math.max(4, (count / max) * 100)}%`, backgroundColor: BAR_COLORS[index % BAR_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, total, children }: { title: string; total?: number; children: React.ReactNode }) {
  return (
    <VCard className="p-5">
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold" style={{ color: c.text }}>{title}</h2>
        {total !== undefined && <span className="text-xs tabular-nums" style={{ color: c.textMuted }}>{total}</span>}
      </div>
      {children}
    </VCard>
  );
}

function MonthBars({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).slice(-8);
  if (rows.length === 0) return <p className="text-xs py-4" style={{ color: c.textMuted }}>No claims in this period</p>;
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return (
    <div className="flex items-end gap-2 h-32" role="img" aria-label="Claims per month">
      {rows.map(([month, count]) => (
        <div key={month} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
          <span className="text-[10px] tabular-nums" style={{ color: c.text }}>{count}</span>
          <div className="w-full rounded-t-md" style={{ height: `${Math.max(6, (count / max) * 84)}px`, backgroundColor: c.primary }} />
          <span className="text-[10px] truncate w-full text-center" style={{ color: c.textMuted }}>{month.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

function closeOpenCalendars() {
  document.querySelector("[data-filter-panel]")?.dispatchEvent(
    new CustomEvent("vaultq:filter-hover", { detail: null }),
  );
}

export default function AdminAnalyticsPage() {
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
        // fall through
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

  return (
    <StudentShell active="Reports" userName={user.name} userRole={user.role} pageTitle="Reports" bottomNav={adminNav} logout={handleLogout}>
      <main className="bg-white pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full bg-white">
          <VContentPanel>
            <div data-filter-panel className="rounded-2xl border p-3 lg:p-4 mb-6 flex flex-wrap items-center gap-2"
              style={{ backgroundColor: c.panel, borderColor: c.border }}>
              <div className="relative"
                onPointerEnter={(event) => { if (event.pointerType === "mouse") { setFromAnchor(event.currentTarget); if (!fromOpen) setFromOpen(true); } }}>
                <VFilterButton active={!!from} className="justify-between w-full sm:w-auto sm:min-w-[140px]"
                  aria-haspopup="dialog" aria-expanded={fromOpen}
                  onClick={(event) => { setFromAnchor(event.currentTarget); setFromOpen((open) => !open); }}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Clock size={14} style={{ color: from ? c.primary : c.textMuted }} />
                    <span className="vq-date truncate">{from ? formatDisplayDate(from) : "From date"}</span>
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
                <VFilterButton active={!!to} className="justify-between w-full sm:w-auto sm:min-w-[140px]"
                  aria-haspopup="dialog" aria-expanded={toOpen}
                  onClick={(event) => { setToAnchor(event.currentTarget); setToOpen((open) => !open); }}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Clock size={14} style={{ color: to ? c.primary : c.textMuted }} />
                    <span className="vq-date truncate">{to ? formatDisplayDate(to) : "To date"}</span>
                  </span>
                  <ChevronDown size={13} style={{ color: to ? c.primary : c.textMuted }} />
                </VFilterButton>
                {toOpen && (
                  <CalendarPopover anchor={toAnchor} compact value={to}
                    onChange={(iso) => setTo(iso)} onClose={() => setToOpen(false)} />
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <ResetFiltersButton disabled={!from && !to} onClick={() => { setFrom(""); setTo(""); }} />
              </div>
            </div>

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
                  <div key={index} className="h-52 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} />
                ))}
              </div>
            ) : summary ? (
              <div className="space-y-5" onPointerEnter={closeOpenCalendars}>
                <div className="grid gap-5 md:grid-cols-2">
                  <ChartCard title="Inventory by status" total={summary.items.total}>
                    <BarList data={summary.items.byStatus} />
                  </ChartCard>
                  <ChartCard title="Reports by status" total={summary.reports.total}>
                    <BarList data={summary.reports.byStatus} />
                  </ChartCard>
                  <ChartCard title="Claims per month" total={summary.claims.total}>
                    <MonthBars data={summary.claims.byMonth} />
                  </ChartCard>
                  <ChartCard title="Lockers by status" total={summary.lockers.total}>
                    <BarList data={summary.lockers.byStatus} />
                  </ChartCard>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs px-1" style={{ color: c.textMuted }}>
                  <span>Inventory categories: {Object.keys(summary.items.byCategory).length}</span>
                  <span>Report types: {Object.keys(summary.reports.byType).join(" / ") || "—"}</span>
                  <span>Accounts: {summary.accounts.active} active · {summary.accounts.inactive} inactive</span>
                </div>

                <VCard className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {EXPORTS.map((item) => (
                      <a key={item.type} href={exportHref(item.type)}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-semibold bg-white"
                        style={{ borderColor: c.border, color: c.text }}>
                        <Download size={13} style={{ color: c.primary }} /> {item.label}
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
