"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive, BadgeCheck, ChevronDown, ClipboardList, Clock, Download, FileText, Grid3X3,
  Link2, ListChecks, Lock, Package, RefreshCw, XCircle, type LucideIcon,
} from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VButton, VCard, VContentPanel, VFilterButton, vcolors as c } from "@/components/ui/vault";
import { DateRangePopover } from "@/components/date-calendar";
import { adminNav } from "@/lib/admin-nav";
import { categoryIcon } from "@/lib/category-icons";
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

const PALETTE = ["#2f5580", "#3f8b86", "#7fa8c9", "#9ecfc9", "#23405f", "#64748b"];
const STATUS_ICONS: Record<string, LucideIcon> = {
  VERIFIED: BadgeCheck,
  CLOSED: Archive,
  PENDING: Clock,
  MATCHED: Link2,
  REJECTED: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "#2f5580",
  CLOSED: "#3f8b86",
  PENDING: "#b45309",
  MATCHED: "#64748b",
  REJECTED: "#b91c1c",
};

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function pct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

/** Eight consecutive months ending at the newest month in the data. */
function monthSlots(data: Record<string, number>, count = 8): Array<[string, number]> {
  const keys = Object.keys(data).sort();
  const anchor = keys.length ? new Date(`${keys[keys.length - 1]}-01T00:00:00`) : new Date();
  const slots: Array<[string, number]> = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    slots.push([key, data[key] || 0]);
  }
  return slots;
}

function CardTitle({ title, subtitle, href, icon: Icon, accent = "#2f7f74" }: {
  title: string;
  subtitle?: string;
  href?: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" style={{ color: c.text }}>{title}</h2>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: c.textMuted }}>{subtitle}</p>}
        </div>
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
    <div className="flex w-full flex-col sm:flex-row items-center justify-center gap-5">
      <svg viewBox="0 0 160 160" className="w-[145px] h-[145px] shrink-0" role="img" aria-label="Inventory by status donut chart">
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
      <div className="w-full min-w-0 space-y-1.5 sm:w-auto sm:min-w-[150px] sm:max-w-[220px]">
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

function LineChart({ data }: { data: Record<string, number> }) {
  const slots = monthSlots(data);
  const max = Math.max(1, ...slots.map(([, value]) => value));
  const count = slots.length;
  const points = slots.map(([, value], index) => ({
    x: count > 1 ? (index / (count - 1)) * 100 : 50,
    y: 100 - (value / max) * 78 - 11,
    value,
    month: slots[index][0],
  }));

  return (
    <div className="relative h-48 w-full" role="img" aria-label="Reports per month line chart">
      {[11, 50, 89].map((top) => (
        <div key={top} className="absolute inset-x-0 border-t" style={{ top: `${top}%`, borderColor: c.borderLight }} />
      ))}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none" stroke={c.primary} strokeWidth="2" vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {points.map((point) => (
        <div key={point.month} className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}>
          <span className="block h-2.5 w-2.5 rounded-full bg-white border-2" style={{ borderColor: c.primary }} />
          {point.value > 0 && (
            <span className="absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold" style={{ color: c.text }}>
              {point.value}
            </span>
          )}
        </div>
      ))}
      {points.map((point) => (
        <span key={`${point.month}-label`} className="absolute bottom-0 whitespace-nowrap text-[9px]"
          style={{
            left: `${point.x}%`,
            color: c.textMuted,
            transform: point.x === 0 ? "translateX(0)" : point.x === 100 ? "translateX(-100%)" : "translateX(-50%)",
          }}>
          {point.month.slice(2)}
        </span>
      ))}
    </div>
  );
}

function ColumnBars({ data }: { data: Record<string, number> }) {
  const slots = monthSlots(data);
  const max = Math.max(1, ...slots.map(([, value]) => value));

  return (
    <div className="flex items-end gap-1.5 h-40" role="img" aria-label="Claims per month column chart">
      {slots.map(([month, value]) => (
        <div key={month} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
          <span className="text-[10px] tabular-nums font-semibold" style={{ color: c.text }}>{value || ""}</span>
          <div className="w-full max-w-[34px] rounded-t-md" style={{ height: `${Math.max(4, (value / max) * 112)}px`, backgroundColor: "#2f5580" }} />
          <span className="text-[9px] truncate w-full text-center" style={{ color: c.textMuted }}>{month.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ data, colorFor, iconFor }: { data: Record<string, number>; colorFor?: (name: string) => string; iconFor?: (name: string) => LucideIcon | null }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a).slice(0, 6);
  if (entries.length === 0) return <p className="text-xs py-6 text-center" style={{ color: c.textMuted }}>No data</p>;
  const max = Math.max(1, ...entries.map(([, value]) => value));

  return (
    <div className="space-y-2.5">
      {entries.map(([name, value], index) => {
        const Icon = iconFor ? iconFor(name) : null;
        return (
        <div key={name} className="flex items-center gap-3">
          <span className="w-28 sm:w-32 shrink-0 flex items-center gap-1.5 text-[11px]" style={{ color: c.textMuted }} title={labelize(name)}>
            {Icon && <Icon size={13} className="shrink-0" style={{ color: colorFor ? colorFor(name) : c.primary }} />}
            <span className="truncate">{labelize(name)}</span>
          </span>
          <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ backgroundColor: c.fill }}>
            <div className="h-full rounded-md"
              style={{ width: `${Math.max(6, (value / max) * 100)}%`, backgroundColor: colorFor ? colorFor(name) : PALETTE[index % PALETTE.length] }} />
          </div>
          <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums" style={{ color: c.text }}>{value}</span>
        </div>
        );
      })}
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
              <VFilterButton active={!!from || !!to} className="justify-between w-full sm:w-auto sm:min-w-[170px]"
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
                  <VCard className="p-5 h-full min-h-[300px] flex flex-col">
                    <CardTitle title="Inventory by status" subtitle="Share of items" icon={Package} accent="#2f5580" href={exportHref("items")} />
                    <div className="flex flex-1 items-center justify-center"><Donut data={summary.items.byStatus} /></div>
                  </VCard>
                  <VCard className="p-5 h-full min-h-[300px] flex flex-col">
                    <CardTitle title="Claim approval rate" subtitle="Approved vs rejected" icon={BadgeCheck} accent="#3f8b86" href={exportHref("claims")} />
                    <div className="flex flex-1 items-center justify-center"><Gauge value={approvalRate} label={`${approved} approved · ${rejected} rejected`} color="#3f8b86" /></div>
                  </VCard>
                  <VCard className="p-5 h-full min-h-[300px] flex flex-col">
                    <CardTitle title="Locker utilisation" subtitle="Occupied lockers" icon={Lock} accent="#2f5580" href={exportHref("lockers")} />
                    <div className="flex flex-1 items-center justify-center"><Gauge value={utilisation} label={`${occupied} of ${summary.lockers.total} lockers`} color="#2f5580" /></div>
                  </VCard>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <VCard className="p-5 lg:col-span-2 h-full min-h-[300px] flex flex-col">
                    <CardTitle title="Reports per month" subtitle="Lost and found submissions" icon={FileText} accent="#355C8A" href={exportHref("reports")} />
                    <div className="flex flex-1 flex-col justify-center"><LineChart data={summary.reports.byMonth || {}} /></div>
                  </VCard>
                  <VCard className="p-5 h-full min-h-[300px] flex flex-col">
                    <CardTitle title="Claims per month" subtitle="Volume trend" icon={ClipboardList} accent="#2f7f74" href={exportHref("claims")} />
                    <div className="flex flex-1 flex-col justify-center"><ColumnBars data={summary.claims.byMonth} /></div>
                  </VCard>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <VCard className="p-5 lg:col-span-2 h-full min-h-[300px] flex flex-col">
                    <CardTitle title="Inventory by category" subtitle="Largest categories" icon={Grid3X3} accent="#3f8b86" href={exportHref("items")} />
                    <div className="flex flex-1 flex-col justify-center"><HBar data={summary.items.byCategory} iconFor={(name) => categoryIcon(name)} /></div>
                  </VCard>
                  <VCard className="p-5 h-full min-h-[300px] flex flex-col">
                    <CardTitle title="Reports by status" subtitle="Review outcomes" icon={ListChecks} accent="#2f7f74" href={exportHref("reports")} />
                    <div className="flex flex-1 flex-col justify-center"><HBar data={summary.reports.byStatus} colorFor={(name) => STATUS_COLORS[name] || "#2f5580"} iconFor={(name) => STATUS_ICONS[name] || null} /></div>
                  </VCard>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs px-1" style={{ color: c.textMuted }}>
                  <span>Accounts: {summary.accounts.active} active · {summary.accounts.inactive} inactive</span>
                  <a href={exportHref("accounts")} className="inline-flex items-center gap-1 font-semibold" style={{ color: c.primary }}>
                    <Download size={12} /> Accounts CSV
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
