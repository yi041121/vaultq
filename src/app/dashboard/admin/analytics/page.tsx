"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Download, RefreshCw } from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VButton, VCard, VContentPanel, VFilterButton, vcolors as c } from "@/components/ui/vault";
import { ResetFiltersButton } from "@/components/filter-panel";
import { DateRangePopover } from "@/components/date-calendar";
import { adminNav } from "@/lib/admin-nav";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { formatDisplayDate } from "@/lib/date-format";

interface Summary {
  items: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> };
  reports: { total: number; byType: Record<string, number>; byStatus: Record<string, number>; byMonth?: Record<string, number> };
  claims: { total: number; byStatus: Record<string, number>; byMonth: Record<string, number> };
  lockers: { total: number; byStatus: Record<string, number> };
  accounts: { total: number; byRole: Record<string, number>; active: number; inactive: number };
  audit: { total: number };
}

const PALETTE = ["#2f7f74", "#5fbfae", "#9ad9cb", "#f2b544", "#e08a3c", "#64748b"];

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function pct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function CardTitle({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-4">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: c.text }}>{title}</h2>
        {subtitle && <p className="text-[11px] mt-0.5" style={{ color: c.textMuted }}>{subtitle}</p>}
      </div>
      {href && (
        <a href={href} aria-label={`Export ${title} as CSV`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border bg-white shrink-0"
          style={{ borderColor: c.border, color: c.primary }}>
          <Download size={12} /> CSV
        </a>
      )}
    </div>
  );
}

function Donut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let start = 0;

  if (total === 0) return <p className="text-xs py-8 text-center" style={{ color: c.textMuted }}>No data</p>;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 160 160" className="w-[150px] h-[150px] shrink-0" role="img" aria-label="Inventory by status donut chart">
        <g transform="rotate(-90 80 80)">
          {entries.map(([name, value], index) => {
            const length = (value / total) * circumference;
            const segment = (
              <circle key={name} cx="80" cy="80" r={radius} fill="none"
                stroke={PALETTE[index % PALETTE.length]} strokeWidth="18"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-start} />
            );
            start += length;
            return segment;
          })}
        </g>
        <text x="80" y="76" textAnchor="middle" fontSize="20" fontWeight="700" fill={c.text}>{total}</text>
        <text x="80" y="92" textAnchor="middle" fontSize="9" fill={c.textMuted}>items</text>
      </svg>
      <div className="w-full min-w-0 space-y-1.5">
        {entries.map(([name, value], index) => (
          <div key={name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />
            <span className="truncate flex-1" style={{ color: c.textMuted }}>{labelize(name)}</span>
            <span className="tabular-nums font-semibold" style={{ color: c.text }}>{pct(value, total).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const angle = Math.PI - (clamped / 100) * Math.PI;
  const nx = 80 + Math.cos(angle) * 42;
  const ny = 80 - Math.sin(angle) * 42;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 160 96" className="w-full max-w-[190px]" role="img" aria-label={`${label}: ${clamped.toFixed(1)} percent`}>
        <path d="M24 80 A56 56 0 0 1 136 80" fill="none" stroke={c.fill} strokeWidth="13" strokeLinecap="round" />
        <path d="M24 80 A56 56 0 0 1 136 80" fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
          pathLength={100} strokeDasharray={`${clamped} 100`} />
        <line x1="80" y1="80" x2={nx} y2={ny} stroke={c.text} strokeWidth="2" strokeLinecap="round" />
        <circle cx="80" cy="80" r="3.5" fill={c.text} />
      </svg>
      <p className="text-2xl font-bold tabular-nums -mt-1" style={{ color: c.text }}>{clamped.toFixed(1)}%</p>
      <p className="text-[11px] text-center" style={{ color: c.textMuted }}>{label}</p>
    </div>
  );
}

function lastMonths(data: Record<string, number>, count = 8) {
  return Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).slice(-count);
}

function LineChart({ data }: { data: Record<string, number> }) {
  const entries = lastMonths(data);
  if (entries.length === 0) return <p className="text-xs py-8 text-center" style={{ color: c.textMuted }}>No reports in this period</p>;
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const width = 320;
  const height = 150;
  const padX = 28;
  const padY = 22;
  const step = entries.length > 1 ? (width - padX * 2) / (entries.length - 1) : 0;
  const points = entries.map(([, value], index) => ({
    x: padX + index * step,
    y: height - padY - (value / max) * (height - padY * 2),
    value,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Reports per month line chart">
      {[0, 0.5, 1].map((fraction) => (
        <line key={fraction} x1={padX} x2={width - padX}
          y1={height - padY - fraction * (height - padY * 2)}
          y2={height - padY - fraction * (height - padY * 2)}
          stroke={c.borderLight} strokeWidth="1" />
      ))}
      <polyline points={line} fill="none" stroke={c.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={index}>
          <circle cx={point.x} cy={point.y} r="3" fill="#fff" stroke={c.primary} strokeWidth="2" />
          <text x={point.x} y={point.y - 7} textAnchor="middle" fontSize="9" fontWeight="600" fill={c.text}>{point.value}</text>
          <text x={point.x} y={height - 6} textAnchor="middle" fontSize="8" fill={c.textMuted}>{entries[index][0].slice(2)}</text>
        </g>
      ))}
    </svg>
  );
}

function ColumnBars({ data }: { data: Record<string, number> }) {
  const entries = lastMonths(data);
  if (entries.length === 0) return <p className="text-xs py-8 text-center" style={{ color: c.textMuted }}>No claims in this period</p>;
  const max = Math.max(1, ...entries.map(([, value]) => value));

  return (
    <div className="flex items-end gap-2 h-40" role="img" aria-label="Claims per month column chart">
      {entries.map(([month, value]) => (
        <div key={month} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
          <span className="text-[10px] tabular-nums font-semibold" style={{ color: c.text }}>{value}</span>
          <div className="w-full rounded-t-md" style={{ height: `${Math.max(6, (value / max) * 112)}px`, backgroundColor: "#2f7f74" }} />
          <span className="text-[9px] truncate w-full text-center" style={{ color: c.textMuted }}>{month.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ data, color = "#f2b544" }: { data: Record<string, number>; color?: string }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a).slice(0, 6);
  if (entries.length === 0) return <p className="text-xs py-6 text-center" style={{ color: c.textMuted }}>No data</p>;
  const max = Math.max(1, ...entries.map(([, value]) => value));

  return (
    <div className="space-y-2.5">
      {entries.map(([name, value]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="w-24 sm:w-28 shrink-0 truncate text-[11px]" style={{ color: c.textMuted }} title={labelize(name)}>{labelize(name)}</span>
          <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ backgroundColor: c.fill }}>
            <div className="h-full rounded-md" style={{ width: `${Math.max(6, (value / max) * 100)}%`, backgroundColor: color }} />
          </div>
          <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums" style={{ color: c.text }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeAnchor, setRangeAnchor] = useState<HTMLElement | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
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

  const approved = summary?.claims.byStatus.APPROVED || 0;
  const rejected = summary?.claims.byStatus.REJECTED || 0;
  const approvalRate = pct(approved, approved + rejected);
  const occupied = summary?.lockers.byStatus.OCCUPIED || 0;
  const utilisation = pct(occupied, summary?.lockers.total || 0);

  return (
    <StudentShell active="Reports" userName={user.name} userRole={user.role} pageTitle="Reports" bottomNav={adminNav} logout={handleLogout}>
      <main className="bg-white pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full bg-white">
          <div data-filter-panel className="rounded-2xl border p-3 lg:p-4 mb-6 flex flex-wrap items-center gap-2"
            style={{ backgroundColor: c.panel, borderColor: c.border }}>
            <div className="relative"
              onPointerEnter={(event) => { if (event.pointerType === "mouse") { setRangeAnchor(event.currentTarget); if (!rangeOpen) setRangeOpen(true); } }}>
              <VFilterButton active={!!from || !!to} className="justify-between w-full sm:w-auto sm:min-w-[160px]"
                aria-haspopup="dialog" aria-expanded={rangeOpen}
                onClick={(event) => { setRangeAnchor(event.currentTarget); setRangeOpen((open) => !open); }}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Clock size={14} style={{ color: from || to ? c.primary : c.textMuted }} />
                  <span className="vq-date truncate">
                    {from && to ? (from === to ? formatDisplayDate(from) : `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`) : from ? `${formatDisplayDate(from)} – ?` : "Select date"}
                  </span>
                </span>
                <ChevronDown size={13} style={{ color: from || to ? c.primary : c.textMuted }} />
              </VFilterButton>
              {rangeOpen && (
                <DateRangePopover anchor={rangeAnchor} from={from} to={to}
                  onApply={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }}
                  onClose={() => setRangeOpen(false)} />
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <ResetFiltersButton disabled={!from && !to} onClick={() => { setFrom(""); setTo(""); }} />
            </div>
          </div>

          <VContentPanel>
            {error && (
              <VCard className="mb-4 flex flex-wrap items-center gap-3 p-4" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
                <p className="min-w-0 flex-1 text-sm" style={{ color: c.danger }}>{error}</p>
                <VButton variant="secondary" size="sm" onClick={() => void load()}>
                  <RefreshCw size={13} /> Retry
                </VButton>
              </VCard>
            )}

            {loading && !summary ? (
              <div className="grid md:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading report">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-56 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} />
                ))}
              </div>
            ) : summary ? (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <VCard className="p-5">
                    <CardTitle title="Inventory by status" subtitle="Share of items" href={exportHref("items")} />
                    <Donut data={summary.items.byStatus} />
                  </VCard>
                  <VCard className="p-5">
                    <CardTitle title="Claim approval rate" subtitle="Approved vs rejected claims" href={exportHref("claims")} />
                    <Gauge value={approvalRate} label={`${approved} approved · ${rejected} rejected`} color="#5fbfae" />
                  </VCard>
                  <VCard className="p-5">
                    <CardTitle title="Locker utilisation" subtitle="Occupied lockers" href={exportHref("lockers")} />
                    <Gauge value={utilisation} label={`${occupied} of ${summary.lockers.total} lockers`} color="#f2b544" />
                  </VCard>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <VCard className="p-5 lg:col-span-2">
                    <CardTitle title="Reports per month" subtitle="Lost and found submissions" href={exportHref("reports")} />
                    <LineChart data={summary.reports.byMonth || {}} />
                  </VCard>
                  <VCard className="p-5">
                    <CardTitle title="Claims per month" subtitle="Volume trend" href={exportHref("claims")} />
                    <ColumnBars data={summary.claims.byMonth} />
                  </VCard>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <VCard className="p-5 lg:col-span-2">
                    <CardTitle title="Inventory by category" subtitle="Largest categories" href={exportHref("items")} />
                    <HBar data={summary.items.byCategory} />
                  </VCard>
                  <VCard className="p-5">
                    <CardTitle title="Reports by status" subtitle="Review outcomes" href={exportHref("reports")} />
                    <HBar data={summary.reports.byStatus} color="#5fbfae" />
                  </VCard>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs px-1" style={{ color: c.textMuted }}>
                  <span>Accounts: {summary.accounts.active} active · {summary.accounts.inactive} inactive</span>
                  <a href={exportHref("accounts")} className="inline-flex items-center gap-1 font-semibold" style={{ color: c.primary }}>
                    <Download size={12} /> Accounts CSV
                  </a>
                  <a href={exportHref("audit")} className="inline-flex items-center gap-1 font-semibold" style={{ color: c.primary }}>
                    <Download size={12} /> Activity CSV
                  </a>
                </div>
              </div>
            ) : null}
          </VContentPanel>
        </div>
      </main>
    </StudentShell>
  );
}
