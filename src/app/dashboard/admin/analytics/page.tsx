"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Download, RefreshCw } from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VButton, VCard, VContentPanel, VInput, vcolors as c, font as f } from "@/components/ui/vault";
import { adminNav } from "@/lib/admin-nav";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";

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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <VCard className="p-4 sm:p-5">
      <p className="text-2xl font-bold tabular-nums" style={{ color: c.text }}>{value}</p>
      <p className="text-xs sm:text-sm mt-0.5" style={{ color: c.textMuted }}>{label}</p>
    </VCard>
  );
}

function CountTable({ title, data, empty = "No data" }: { title: string; data: Record<string, number>; empty?: string }) {
  const rows = Object.entries(data);
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: c.text }}>{title}</h3>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: c.borderLight }}>
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-xs" style={{ color: c.textMuted }}>{empty}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([name, count]) => (
                <tr key={name} className="border-t first:border-t-0" style={{ borderColor: c.borderLight }}>
                  <td className="px-3 py-2" style={{ color: c.textMuted }}>{name.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: c.text }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AdminReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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

  return (
    <StudentShell active="Reports" userName={user.name} userRole={user.role} pageTitle="Reports and Analytics" bottomNav={adminNav} logout={handleLogout}>
      <main className="bg-white pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full bg-white">
          <VContentPanel>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <h1 className={f.sectionTitle} style={{ color: c.text }}>Reports and Analytics</h1>
                <p className="text-sm mt-1" style={{ color: c.textMuted }}>
                  Summary counts for the selected period, with CSV exports for record keeping.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs" style={{ color: c.textMuted }}>
                  From
                  <VInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" aria-label="From date" />
                </label>
                <label className="text-xs" style={{ color: c.textMuted }}>
                  To
                  <VInput type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" aria-label="To date" />
                </label>
                <VButton variant="secondary" onClick={() => { setFrom(""); setTo(""); }}>
                  <RefreshCw size={14} /> Reset
                </VButton>
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
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading report">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: c.fill }} />
                ))}
              </div>
            ) : summary ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <StatCard label="Inventory items" value={summary.items.total} />
                  <StatCard label="Reports" value={summary.reports.total} />
                  <StatCard label="Claims" value={summary.claims.total} />
                  <StatCard label="Lockers" value={summary.lockers.total} />
                  <StatCard label="Accounts" value={summary.accounts.total} />
                  <StatCard label="Activity entries" value={summary.audit.total} />
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <VCard className="p-5">
                    <CountTable title="Inventory by status" data={summary.items.byStatus} />
                    <div className="mt-4">
                      <CountTable title="Inventory by category" data={summary.items.byCategory} />
                    </div>
                  </VCard>
                  <VCard className="p-5">
                    <CountTable title="Reports by type" data={summary.reports.byType} />
                    <div className="mt-4">
                      <CountTable title="Reports by status" data={summary.reports.byStatus} />
                    </div>
                  </VCard>
                  <VCard className="p-5">
                    <CountTable title="Claims by status" data={summary.claims.byStatus} />
                    <div className="mt-4">
                      <CountTable title="Claims by month" data={summary.claims.byMonth} empty="No claims in this period" />
                    </div>
                  </VCard>
                  <VCard className="p-5">
                    <CountTable title="Lockers by status" data={summary.lockers.byStatus} />
                  </VCard>
                  <VCard className="p-5">
                    <CountTable title="Accounts by role" data={summary.accounts.byRole} />
                    <div className="mt-4">
                      <CountTable title="Account state" data={{ Active: summary.accounts.active, Inactive: summary.accounts.inactive }} />
                    </div>
                  </VCard>
                  <VCard className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 size={16} style={{ color: c.primary }} />
                      <h3 className="text-sm font-semibold" style={{ color: c.text }}>Download CSV</h3>
                    </div>
                    <div className="flex flex-col gap-2">
                      {EXPORTS.map((item) => (
                        <a key={item.type} href={exportHref(item.type)}
                          className="inline-flex items-center justify-between gap-2 h-10 px-3 rounded-lg border text-sm font-medium bg-white"
                          style={{ borderColor: c.border, color: c.text }}>
                          {item.label}
                          <Download size={14} style={{ color: c.primary }} />
                        </a>
                      ))}
                    </div>
                    <p className="text-[11px] mt-3" style={{ color: c.textMuted }}>
                      Exports respect the date range above.
                    </p>
                  </VCard>
                </div>
              </div>
            ) : null}
          </VContentPanel>
        </div>
      </main>
    </StudentShell>
  );
}
