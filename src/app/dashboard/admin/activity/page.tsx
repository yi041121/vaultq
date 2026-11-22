"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, History, RefreshCw } from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { VButton, VCard, VContentPanel, VEmptyState, VInput, vcolors as c, font as f } from "@/components/ui/vault";
import { adminNav } from "@/lib/admin-nav";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { formatDisplayTimestamp } from "@/lib/date-format";

interface AuditRow {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  REPORT_VERIFIED: "Report verified",
  REPORT_MATCHED: "Report matched",
  REPORT_REJECTED: "Report rejected",
  REPORT_CLOSED: "Report closed",
  REPORT_REOPENED: "Report reopened",
  REPORT_UPDATED: "Report updated",
  CLAIM_APPROVED: "Claim approved",
  CLAIM_REJECTED: "Claim rejected",
  ITEM_CREATED: "Item created",
  ITEM_UPDATED: "Item updated",
  ITEM_DELETED: "Item deleted",
  LOCKER_CREATED: "Locker created",
  LOCKER_ASSIGNED: "Locker assigned",
  LOCKER_RELEASED: "Locker released",
  LOCKER_UPDATED: "Locker updated",
  LOCKER_DELETED: "Locker deleted",
  ACCOUNT_CREATED: "Account created",
  ACCOUNT_UPDATED: "Account updated",
  ACCOUNT_DELETED: "Account deleted",
  ACCOUNT_TEMP_PASSWORD: "Temporary password issued",
};

const ACTIONS = ["ALL", ...Object.keys(ACTION_LABELS)];
const ENTITIES = ["ALL", "REPORT", "CLAIM", "ITEM", "LOCKER", "ACCOUNT"];

const PAGE_SIZE = 20;

function FilterSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, ...rest } = props;
  return (
    <select {...rest}
      className="h-11 w-full rounded-xl border bg-white px-3 text-sm cursor-pointer"
      style={{ borderColor: c.border, color: c.text, ...style }} />
  );
}

export default function AdminActivityPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("ALL");
  const [entityType, setEntityType] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        setUser({ name: "Admin User", role: "ADMIN" });
      }
    } else {
      setUser({ name: "Admin User", role: "ADMIN" });
    }
  }, []);

  const load = useCallback(async () => {
    const token = getBrowserSessionKey();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());
      if (action !== "ALL") params.set("action", action);
      if (entityType !== "ALL") params.set("entityType", entityType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/activity?${params.toString()}`, {
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load activity");
      setRows(Array.isArray(data.data) ? data.data : []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [page, query, action, entityType, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleLogout() {
    clearStoredBrowserSession();
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportHref = (() => {
    const params = new URLSearchParams({ type: "audit" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/admin/reports/export?${params.toString()}`;
  })();

  if (!user) return null;

  return (
    <StudentShell active="Activity" userName={user.name} userRole={user.role} pageTitle="Activity Log" bottomNav={adminNav} logout={handleLogout}>
      <main className="bg-white pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full bg-white">
          <VContentPanel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h1 className={f.sectionTitle} style={{ color: c.text }}>Activity Log</h1>
                <p className="text-sm mt-1" style={{ color: c.textMuted }}>
                  Every administrative action, newest first. {total} record{total === 1 ? "" : "s"}.
                </p>
              </div>
              <a href={exportHref} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold border bg-white cursor-pointer"
                style={{ borderColor: c.border, color: c.primary }}>
                <Download size={15} /> Export CSV
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 mb-5">
              <div className="lg:col-span-2">
                <VInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder="Search summary, actor or ID" aria-label="Search activity" />
              </div>
              <FilterSelect value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter by action">
                {ACTIONS.map((value) => (
                  <option key={value} value={value}>{value === "ALL" ? "All actions" : ACTION_LABELS[value]}</option>
                ))}
              </FilterSelect>
              <FilterSelect value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} aria-label="Filter by entity">
                {ENTITIES.map((value) => (
                  <option key={value} value={value}>{value === "ALL" ? "All entities" : value}</option>
                ))}
              </FilterSelect>
              <VInput type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
              <VInput type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
            </div>

            {error && (
              <VCard className="mb-4 flex flex-wrap items-center gap-3 p-4" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
                <p className="min-w-0 flex-1 text-sm" style={{ color: c.danger }}>{error}</p>
                <VButton variant="secondary" size="sm" onClick={() => void load()}>
                  <RefreshCw size={13} /> Retry
                </VButton>
              </VCard>
            )}

            <VCard className="p-0 overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-3" aria-busy="true" aria-label="Loading activity">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-10 rounded-lg animate-pulse" style={{ backgroundColor: c.fill }} />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <VEmptyState icon={History} title="No activity yet" description="Actions such as verifying a report or approving a claim will appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead>
                      <tr style={{ backgroundColor: c.fill, color: c.textMuted }}>
                        <th className="px-4 py-3 font-semibold">Time</th>
                        <th className="px-4 py-3 font-semibold">Actor</th>
                        <th className="px-4 py-3 font-semibold">Action</th>
                        <th className="px-4 py-3 font-semibold">Entity</th>
                        <th className="px-4 py-3 font-semibold">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t" style={{ borderColor: c.borderLight }}>
                          <td className="px-4 py-3 whitespace-nowrap vq-date" style={{ color: c.textMuted }}>
                            {formatDisplayTimestamp(row.createdAt)}
                          </td>
                          <td className="px-4 py-3" style={{ color: c.text }}>{row.actorName || "System"}</td>
                          <td className="px-4 py-3 whitespace-nowrap" style={{ color: c.text }}>
                            {ACTION_LABELS[row.action] || row.action}
                          </td>
                          <td className="px-4 py-3" style={{ color: c.textMuted }}>{row.entityType}</td>
                          <td className="px-4 py-3" style={{ color: c.text }}>{row.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </VCard>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs" style={{ color: c.textMuted }}>
                Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Previous page" disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-40"
                  style={{ borderColor: c.border, color: c.textMuted }}>
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs" style={{ color: c.textMuted }}>Page {page} of {pages}</span>
                <button type="button" aria-label="Next page" disabled={page >= pages}
                  onClick={() => setPage((value) => Math.min(pages, value + 1))}
                  className="w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-40"
                  style={{ borderColor: c.border, color: c.textMuted }}>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </VContentPanel>
        </div>
      </main>
    </StudentShell>
  );
}
