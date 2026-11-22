"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Download, History, RefreshCw } from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import {
  VButton, VCard, VContentPanel, VDropdown, VDropdownItem, VEmptyState, VFilterButton,
  VPaginationFooter, vcolors as c,
} from "@/components/ui/vault";
import { FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { PillSearchInput } from "@/components/pill-search-input";
import { CalendarPopover } from "@/components/date-calendar";
import { adminNav } from "@/lib/admin-nav";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { formatDisplayDate, formatDisplayTimestamp } from "@/lib/date-format";

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

const ACTIONS = Object.keys(ACTION_LABELS);
const ENTITIES = ["REPORT", "CLAIM", "ITEM", "LOCKER", "ACCOUNT"];
const PAGE_SIZE = 20;

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
  const [actionOpen, setActionOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [fromAnchor, setFromAnchor] = useState<HTMLElement | null>(null);
  const [toAnchor, setToAnchor] = useState<HTMLElement | null>(null);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
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
  const hasFilters = !!query || action !== "ALL" || entityType !== "ALL" || !!from || !!to;
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
          <FilterPanel
            search={
              <PillSearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }}
                clearable placeholder="Search summary, actor or ID" className="w-full" aria-label="Search activity" />
            }
            actions={
              <VButton onClick={() => { window.location.href = exportHref; }}>
                <Download size={13} /> Export CSV
              </VButton>
            }
            filters={
              <>
                <VDropdown open={actionOpen} onOpenChange={setActionOpen} width="w-56" align="left"
                  trigger={
                    <VFilterButton active={action !== "ALL"} className="w-full justify-between sm:w-auto sm:min-w-[150px]"
                      onClick={() => setActionOpen(!actionOpen)}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <History size={14} style={{ color: action !== "ALL" ? c.primary : c.textMuted }} />
                        <span className="truncate">{action === "ALL" ? "All actions" : ACTION_LABELS[action]}</span>
                      </span>
                      <ChevronDown size={13} style={{ color: action !== "ALL" ? c.primary : c.textMuted }} />
                    </VFilterButton>
                  }>
                  {(close) => (
                    <>
                      <VDropdownItem active={action === "ALL"} onSelect={() => { setAction("ALL"); setPage(1); close(); }}>
                        All actions
                      </VDropdownItem>
                      <div style={{ borderColor: c.border }} className="mx-3 border-t" />
                      {ACTIONS.map((value) => (
                        <VDropdownItem key={value} active={action === value}
                          onSelect={() => { setAction(value); setPage(1); close(); }}>
                          {ACTION_LABELS[value]}
                        </VDropdownItem>
                      ))}
                    </>
                  )}
                </VDropdown>

                <VDropdown open={entityOpen} onOpenChange={setEntityOpen} width="w-44" align="left"
                  trigger={
                    <VFilterButton active={entityType !== "ALL"} className="w-full justify-between sm:w-auto sm:min-w-[130px]"
                      onClick={() => setEntityOpen(!entityOpen)}>
                      <span className="truncate">{entityType === "ALL" ? "All entities" : entityType}</span>
                      <ChevronDown size={13} style={{ color: entityType !== "ALL" ? c.primary : c.textMuted }} />
                    </VFilterButton>
                  }>
                  {(close) => (
                    <>
                      <VDropdownItem active={entityType === "ALL"} onSelect={() => { setEntityType("ALL"); setPage(1); close(); }}>
                        All entities
                      </VDropdownItem>
                      <div style={{ borderColor: c.border }} className="mx-3 border-t" />
                      {ENTITIES.map((value) => (
                        <VDropdownItem key={value} active={entityType === value}
                          onSelect={() => { setEntityType(value); setPage(1); close(); }}>
                          {value}
                        </VDropdownItem>
                      ))}
                    </>
                  )}
                </VDropdown>

                <div className="relative"
                  onPointerEnter={(event) => { if (event.pointerType === "mouse") { setFromAnchor(event.currentTarget); if (!fromOpen) setFromOpen(true); } }}>
                  <VFilterButton active={!!from} className="justify-between w-full sm:w-auto sm:min-w-[130px]"
                    aria-haspopup="dialog" aria-expanded={fromOpen}
                    onClick={(event) => { setFromAnchor(event.currentTarget); setFromOpen((open) => !open); }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Clock size={14} style={{ color: from ? c.primary : c.textMuted }} />
                      <span className="vq-date truncate">{from ? formatDisplayDate(from) : "From date"}</span>
                    </span>
                    <ChevronDown size={13} style={{ color: from ? c.primary : c.textMuted }} />
                  </VFilterButton>
                  {fromOpen && (
                    <CalendarPopover anchor={fromAnchor} compact closeOnPointerLeave value={from}
                      onChange={(iso) => setFrom(iso)} onClose={() => setFromOpen(false)} />
                  )}
                </div>

                <div className="relative"
                  onPointerEnter={(event) => { if (event.pointerType === "mouse") { setToAnchor(event.currentTarget); if (!toOpen) setToOpen(true); } }}>
                  <VFilterButton active={!!to} className="justify-between w-full sm:w-auto sm:min-w-[130px]"
                    aria-haspopup="dialog" aria-expanded={toOpen}
                    onClick={(event) => { setToAnchor(event.currentTarget); setToOpen((open) => !open); }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Clock size={14} style={{ color: to ? c.primary : c.textMuted }} />
                      <span className="vq-date truncate">{to ? formatDisplayDate(to) : "To date"}</span>
                    </span>
                    <ChevronDown size={13} style={{ color: to ? c.primary : c.textMuted }} />
                  </VFilterButton>
                  {toOpen && (
                    <CalendarPopover anchor={toAnchor} compact closeOnPointerLeave value={to}
                      onChange={(iso) => setTo(iso)} onClose={() => setToOpen(false)} />
                  )}
                </div>
              </>
            }
            reset={
              <ResetFiltersButton disabled={!hasFilters}
                onClick={() => { setQuery(""); setAction("ALL"); setEntityType("ALL"); setFrom(""); setTo(""); setPage(1); }} />
            }
          />

          <VContentPanel>
            {error && (
              <VCard className="mb-4 flex flex-wrap items-center gap-3 p-4" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
                <p className="min-w-0 flex-1 text-sm" style={{ color: c.danger }}>{error}</p>
                <VButton variant="secondary" size="sm" onClick={() => void load()}>
                  <RefreshCw size={13} /> Retry
                </VButton>
              </VCard>
            )}

            <div>
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

              <VPaginationFooter current={page} total={pages} pageSize={PAGE_SIZE} itemCount={total} onPage={setPage} />
            </div>
          </VContentPanel>
        </div>
      </main>
    </StudentShell>
  );
}
