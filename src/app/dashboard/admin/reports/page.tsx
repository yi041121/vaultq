"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, PackageSearch, PackageCheck, FileText, Lock, Users, Search, Clock, MapPin,
  CheckCircle2, XCircle, Eye, RotateCcw, X, Loader2, RefreshCw, Camera, Plus, Link2, Grid3X3,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VBadge, VButton, VSearchInput, VTextarea, VInput, VDropdown, VDropdownItem, vcolors as c,
} from "@/components/ui/vault";
import { ITEM_CATEGORIES } from "@/lib/categories";
import { mapReport, type UserReport, type ReportStatus, type ReportType } from "@/lib/report-mapper";

interface User { id: string; name: string; email: string; role: string; }

type FoundItem = {
  id: string;
  itemName: string;
  category: string | null;
  description: string | null;
  foundLocation: string | null;
  foundDate: string | null;
  imageUrl: string | null;
  locker: { lockerNumber: string } | null;
};

type Locker = { id: string; lockerNumber: string; status: string };

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Reports", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

const statusOptions: Array<ReportStatus | "ALL"> = ["ALL", "PENDING", "MATCHED", "VERIFIED", "REJECTED", "CLOSED"];
const statusLabel: Record<string, string> = {
  ALL: "All statuses",
  PENDING: "Pending",
  MATCHED: "Matched",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

function fmtDay(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTimestamp(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminReports() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  const [reports, setReports] = useState<UserReport[]>([]);
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<"ALL" | ReportType>("ALL");
  const [filterStatus, setFilterStatus] = useState<ReportStatus | "ALL">("ALL");
  const [statusOpen, setStatusOpen] = useState(false);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<UserReport | null>(null);
  const [matchQuery, setMatchQuery] = useState("");

  const [verifyReport, setVerifyReport] = useState<UserReport | null>(null);
  const [verifyMode, setVerifyMode] = useState<"create" | "link">("create");
  const [verifyItemId, setVerifyItemId] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
  const [verifyForm, setVerifyForm] = useState({
    itemName: "", category: "", location: "", date: "", description: "", lockerId: "",
  });
  const [verifyCategoryOpen, setVerifyCategoryOpen] = useState(false);
  const [lockerOpen, setLockerOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [rejectReport, setRejectReport] = useState<UserReport | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [busyAction, setBusyAction] = useState(false);

  function authHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchReports() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/reports", { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load reports");
      setReports((data.data as any[]).map(mapReport));
    } catch (e) {
      setReports([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSupporting() {
    try {
      const [itemsRes, lockersRes] = await Promise.all([
        fetch("/api/items?status=FOUND", { headers: authHeaders(), cache: "no-store" }),
        fetch("/api/lockers?status=AVAILABLE", { headers: authHeaders(), cache: "no-store" }),
      ]);
      const itemsJson = await itemsRes.json().catch(() => null);
      if (itemsJson?.success) setFoundItems((itemsJson.data as any[]).map((it) => ({
        id: it.id,
        itemName: it.itemName,
        category: it.category,
        description: it.description,
        foundLocation: it.foundLocation,
        foundDate: it.foundDate,
        imageUrl: it.imageUrl,
        locker: it.locker || null,
      })));
      const lockersJson = await lockersRes.json().catch(() => null);
      if (lockersJson?.success) setLockers(lockersJson.data || []);
    } catch {
      // Supporting data is optional; actions will surface a clear error.
    }
  }

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    setUser(stored ? JSON.parse(stored) : { name: "Admin User", role: "ADMIN" });
    void fetchReports();
    void fetchSupporting();
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  function openVerify(report: UserReport) {
    setVerifyReport(report);
    setVerifyMode("create");
    setVerifyItemId("");
    setLinkQuery("");
    setVerifyForm({
      itemName: report.itemName,
      category: report.category,
      location: report.location,
      date: report.date,
      description: report.description,
      lockerId: "",
    });
  }

  async function runAction(id: string, body: Record<string, unknown>, successMessage: string) {
    setBusyAction(true);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Action failed");
        return false;
      }
      showCenteredMessage("success", successMessage);
      setSelected(null);
      await fetchReports();
      await fetchSupporting();
      return true;
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Action failed");
      return false;
    } finally {
      setBusyAction(false);
    }
  }

  async function handleMatch(itemId: string) {
    if (!selected) return;
    await runAction(selected.id, { action: "match", itemId }, "Report matched — the student has been notified");
  }

  async function handleReject() {
    if (!rejectReport || rejecting) return;
    setRejecting(true);
    try {
      await runAction(rejectReport.id, { action: "reject", adminNote: rejectNote.trim() || undefined }, "Report rejected");
      setRejectReport(null);
      setRejectNote("");
    } finally {
      setRejecting(false);
    }
  }

  async function handleVerify() {
    if (!verifyReport || verifying) return;
    setVerifying(true);
    try {
      const body = verifyMode === "link"
        ? { itemId: verifyItemId }
        : {
            create: {
              itemName: verifyForm.itemName.trim(),
              category: verifyForm.category || null,
              location: verifyForm.location.trim(),
              date: verifyForm.date || null,
              description: verifyForm.description.trim() || null,
              lockerId: verifyForm.lockerId || null,
            },
          };
      if (verifyMode === "link" && !verifyItemId) {
        showCenteredMessage("error", "Select an item to link");
        return;
      }
      if (verifyMode === "create" && (!verifyForm.itemName.trim() || !verifyForm.location.trim())) {
        showCenteredMessage("error", "Item name and found location are required");
        return;
      }

      const res = await fetch(`/api/reports/${verifyReport.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to verify report");
        return;
      }
      showCenteredMessage("success", "Found report verified and item logged");
      setVerifyReport(null);
      setSelected(null);
      await fetchReports();
      await fetchSupporting();
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to verify report");
    } finally {
      setVerifying(false);
    }
  }

  if (!user || !mounted) return null;

  const filtered = reports.filter((report) => {
    if (filterType !== "ALL" && report.type !== filterType) return false;
    if (filterStatus !== "ALL" && report.status !== filterStatus) return false;
    if (query) {
      const haystack = `${report.itemName} ${report.description} ${report.studentName} ${report.studentEmail} ${report.studentId}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const pendingCount = reports.filter((r) => r.status === "PENDING").length;
  const matchResults = foundItems.filter((item) => {
    if (!matchQuery.trim()) return true;
    const q = matchQuery.toLowerCase();
    return `${item.itemName} ${item.description || ""} ${item.foundLocation || ""}`.toLowerCase().includes(q);
  }).slice(0, 6);
  const linkResults = foundItems.filter((item) => {
    if (!linkQuery.trim()) return true;
    const q = linkQuery.toLowerCase();
    return `${item.itemName} ${item.description || ""} ${item.foundLocation || ""}`.toLowerCase().includes(q);
  }).slice(0, 6);

  return (
    <StudentShell active="Reports" userName={user.name} userRole={user.role} pageTitle="Lost & Found Reports" bottomNav={adminNav} logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <div className="flex rounded-xl border bg-white overflow-hidden" style={{ borderColor: c.border }}>
              {(["ALL", "LOST", "FOUND"] as const).map((value) => (
                <button key={value} type="button"
                  className="px-3.5 h-10 text-xs font-semibold transition-all duration-150 cursor-pointer"
                  style={{
                    backgroundColor: filterType === value ? c.primary : "transparent",
                    color: filterType === value ? "#fff" : c.textMuted,
                  }}
                  onClick={() => setFilterType(value)}>
                  {value === "ALL" ? "All reports" : value === "LOST" ? "Lost" : "Found"}
                </button>
              ))}
            </div>

            <VDropdown
              open={statusOpen}
              onOpenChange={setStatusOpen}
              width="w-44"
              trigger={
                <button type="button"
                  className="flex items-center gap-2 h-10 px-3.5 rounded-xl text-sm font-medium border bg-white cursor-pointer"
                  style={{ borderColor: filterStatus === "ALL" ? c.border : c.primary, color: c.text }}
                  onClick={() => setStatusOpen(!statusOpen)}>
                  <span>{statusLabel[filterStatus]}</span>
                  <span className="text-xs" style={{ color: c.textMuted }}>▾</span>
                </button>
              }>
              {(close) => (
                <>
                  {statusOptions.map((status) => (
                    <VDropdownItem key={status} active={filterStatus === status}
                      onSelect={() => { setFilterStatus(status); close(); }}>
                      {statusLabel[status]}
                    </VDropdownItem>
                  ))}
                </>
              )}
            </VDropdown>

            <VSearchInput value={query} onChange={setQuery} placeholder="Search item or student..." className="flex-1 min-w-[220px] max-w-md" />
            <span className="text-xs ml-auto" style={{ color: c.textMuted }}>
              {pendingCount} pending · {reports.length} total
            </span>
          </div>

          {loading ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Loader2 size={32} className="animate-spin mb-4" style={{ color: c.primary }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Loading reports...</p>
            </VCard>
          ) : loadError ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <PackageSearch size={40} className="mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load reports</p>
              <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{loadError}</p>
              <VButton variant="secondary" onClick={() => void fetchReports()}><RefreshCw size={14} /> Try again</VButton>
            </VCard>
          ) : filtered.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <PackageSearch size={40} className="mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>No reports found</p>
              <p className="text-sm mt-1" style={{ color: c.textLight }}>
                {reports.length === 0 ? "Students have not submitted any reports yet." : "Try adjusting the filters."}
              </p>
            </VCard>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((report) => (
                <VCard key={report.id} className="p-5 flex flex-col">
                  <div className="w-full h-36 rounded-xl mb-4 relative overflow-hidden flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}>
                    {report.imageUrl ? (
                      <img src={report.imageUrl} alt={report.itemName} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <>
                        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                        {report.type === "LOST"
                          ? <PackageSearch size={38} style={{ color: c.primary, opacity: 0.6 }} />
                          : <PackageCheck size={38} style={{ color: c.accent, opacity: 0.7 }} />}
                      </>
                    )}
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      <VBadge color={report.type === "LOST" ? c.primary : c.accent}>{report.typeLabel}</VBadge>
                      <VBadge color={report.color}>{report.statusLabel}</VBadge>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{report.itemName}</h3>
                  </div>
                  <p className="text-[11px] mb-2" style={{ color: c.textLight }}>{report.reference} · {report.category}</p>

                  <div className="space-y-1.5 text-xs mb-3" style={{ color: c.textMuted }}>
                    <p className="flex items-center gap-1.5"><Users size={12} /> {report.studentName}{report.studentId ? ` · ${report.studentId}` : ""}</p>
                    <p className="flex items-center gap-1.5"><MapPin size={12} /> {report.location || "—"}</p>
                    <p className="flex items-center gap-1.5"><Clock size={12} /> {fmtDay(report.date)}</p>
                  </div>

                  <p className="text-xs line-clamp-2 mb-3" style={{ color: c.textMuted }}>{report.description}</p>

                  {report.item && (
                    <p className="text-[11px] mb-3 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: c.fill, color: c.textMuted }}>
                      {report.type === "LOST" ? "Matched" : "Logged"}: <b style={{ color: c.text }}>{report.item.name}</b>
                      {report.item.locker ? ` · Locker ${report.item.locker}` : ""}
                    </p>
                  )}

                  <div className="mt-auto flex items-center gap-2">
                    <VButton variant="secondary" className="flex-1" onClick={() => { setSelected(report); setMatchQuery(""); }}>
                      <Eye size={14} /> Review
                    </VButton>
                    {report.type === "FOUND" && report.status === "PENDING" && (
                      <VButton className="flex-1" onClick={() => openVerify(report)}>
                        <CheckCircle2 size={14} /> Verify
                      </VButton>
                    )}
                    {report.type === "LOST" && report.status === "PENDING" && (
                      <VButton className="flex-1" onClick={() => { setSelected(report); setMatchQuery(""); }}>
                        <Search size={14} /> Match
                      </VButton>
                    )}
                  </div>
                </VCard>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Review modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <VCard className="relative w-full max-w-3xl max-h-[92vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <VBadge color={selected.type === "LOST" ? c.primary : c.accent}>{selected.typeLabel}</VBadge>
                  <VBadge color={selected.color}>{selected.statusLabel}</VBadge>
                  <span className="text-[11px]" style={{ color: c.textLight }}>{selected.reference}</span>
                </div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>{selected.itemName}</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>
                  {selected.studentName} · {selected.studentEmail}{selected.studentId ? ` · ${selected.studentId}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Reported photos</p>
                {selected.images.length > 0 ? (
                  <div className={`grid gap-2 ${selected.images.length === 1 ? "grid-cols-1" : selected.images.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {selected.images.map((src, index) => (
                      <img key={`${selected.id}-photo-${index}`} src={src} alt={`${selected.itemName} photo ${index + 1}`}
                        className={`w-full object-cover rounded-xl border bg-[#f8fafc] ${selected.images.length === 1 ? "h-56" : "h-28"}`}
                        style={{ borderColor: c.border }} />
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-56 rounded-xl border flex flex-col items-center justify-center gap-2" style={{ borderColor: c.border, backgroundColor: c.fill, color: c.textLight }}>
                    <Camera size={28} />
                    <span className="text-xs">No photo uploaded</span>
                  </div>
                )}
              </div>
              <div className="space-y-2 text-xs" style={{ color: c.textMuted }}>
                <p><span className="font-semibold" style={{ color: c.text }}>Category:</span> {selected.category}</p>
                <p><span className="font-semibold" style={{ color: c.text }}>Location:</span> {selected.location || "—"}</p>
                <p><span className="font-semibold" style={{ color: c.text }}>Date:</span> {fmtDay(selected.date)}</p>
                <p><span className="font-semibold" style={{ color: c.text }}>Submitted:</span> {fmtTimestamp(selected.createdAt)}</p>
                <p><span className="font-semibold" style={{ color: c.text }}>Reviewed:</span> {fmtTimestamp(selected.reviewedAt)}</p>
                <div className="rounded-xl p-3 mt-2" style={{ backgroundColor: c.fill }}>
                  <p className="font-semibold mb-1" style={{ color: c.text }}>Description</p>
                  <p className="leading-relaxed">{selected.description}</p>
                </div>
                {selected.adminNote && (
                  <div className="rounded-xl p-3" style={{ backgroundColor: "#fef2f2", color: c.danger }}>
                    <p className="font-semibold mb-1">Admin note</p>
                    <p>{selected.adminNote}</p>
                  </div>
                )}
              </div>
            </div>

            {selected.item && (
              <div className="rounded-xl p-3.5 mb-4 flex items-center gap-3" style={{ backgroundColor: c.primarySoft }}>
                {selected.item.imageUrl ? (
                  <img src={selected.item.imageUrl} alt={selected.item.name} className="w-12 h-12 rounded-lg object-cover border" style={{ borderColor: c.border }} />
                ) : (
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.borderLight }}>
                    <Package size={20} style={{ color: c.primary }} />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-xs font-semibold" style={{ color: c.text }}>
                    {selected.type === "LOST" ? "Matched item" : "Logged item"}: {selected.item.name}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: c.textMuted }}>
                    Status {selected.item.status}{selected.item.locker ? ` · Locker ${selected.item.locker}` : ""}
                  </p>
                </div>
              </div>
            )}

            {/* Lost report: match to a found item */}
            {selected.type === "LOST" && ["PENDING", "MATCHED"].includes(selected.status) && (
              <div className="rounded-xl border p-4 mb-4" style={{ borderColor: c.border }}>
                <p className="text-sm font-semibold mb-1" style={{ color: c.text }}>
                  {selected.status === "MATCHED" ? "Change matched item" : "Match to a found item"}
                </p>
                <p className="text-xs mb-3" style={{ color: c.textMuted }}>
                  The student is notified and can submit a claim with evidence. Matching does not hand over the item automatically.
                </p>
                <VSearchInput value={matchQuery} onChange={setMatchQuery} placeholder="Search found items..." className="mb-3" />
                <div className="space-y-2 max-h-56 overflow-auto">
                  {matchResults.length === 0 ? (
                    <p className="text-xs py-3 text-center" style={{ color: c.textLight }}>No found items match your search.</p>
                  ) : matchResults.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl border" style={{ borderColor: c.borderLight }}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.itemName} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.fill }}>
                          <Package size={16} style={{ color: c.primary }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{item.itemName}</p>
                        <p className="text-[11px] truncate" style={{ color: c.textMuted }}>
                          {item.foundLocation || "—"} · {fmtDay(item.foundDate)}{item.locker ? ` · Locker ${item.locker.lockerNumber}` : ""}
                        </p>
                      </div>
                      <VButton size="sm" disabled={busyAction} onClick={() => void handleMatch(item.id)}>
                        Match
                      </VButton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Found report: verify */}
            {selected.type === "FOUND" && selected.status === "PENDING" && (
              <div className="rounded-xl border p-4 mb-4 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: c.border }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: c.text }}>Verify this found report</p>
                  <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>
                    Confirm the item was handed in, then log it into inventory with a locker.
                  </p>
                </div>
                <VButton onClick={() => openVerify(selected)}><CheckCircle2 size={14} /> Verify &amp; log item</VButton>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: c.borderLight }}>
              <VButton variant="secondary" onClick={() => setSelected(null)}>Close</VButton>
              {["PENDING", "MATCHED"].includes(selected.status) && selected.type === "LOST" && (
                <VButton variant="secondary" disabled={busyAction}
                  onClick={() => void runAction(selected.id, { action: "close" }, "Lost report closed")}>
                  Close report
                </VButton>
              )}
              {selected.status !== "VERIFIED" && selected.status !== "REJECTED" && (
                <VButton variant="danger" onClick={() => { setRejectReport(selected); setRejectNote(""); }}>
                  <XCircle size={14} /> Reject
                </VButton>
              )}
              {["REJECTED", "CLOSED"].includes(selected.status) && (
                <VButton onClick={() => void runAction(selected.id, { action: "reopen" }, "Report reopened")}>
                  <RotateCcw size={14} /> Reopen
                </VButton>
              )}
            </div>
          </VCard>
        </div>
      )}

      {/* Verify modal */}
      {verifyReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!verifying) setVerifyReport(null); }} />
          <VCard className="relative w-full max-w-2xl max-h-[92vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Verify found report</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{verifyReport.itemName} · {verifyReport.studentName}</p>
              </div>
              <button type="button" onClick={() => { if (!verifying) setVerifyReport(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <div className="flex rounded-xl border overflow-hidden mb-4" style={{ borderColor: c.border }}>
              <button type="button" className="flex-1 h-9 text-xs font-semibold cursor-pointer"
                style={{ backgroundColor: verifyMode === "create" ? c.primary : "transparent", color: verifyMode === "create" ? "#fff" : c.textMuted }}
                onClick={() => setVerifyMode("create")}>
                <Plus size={13} className="inline mr-1" /> Create new item
              </button>
              <button type="button" className="flex-1 h-9 text-xs font-semibold cursor-pointer"
                style={{ backgroundColor: verifyMode === "link" ? c.primary : "transparent", color: verifyMode === "link" ? "#fff" : c.textMuted }}
                onClick={() => setVerifyMode("link")}>
                <Link2 size={13} className="inline mr-1" /> Link existing item
              </button>
            </div>

            {verifyMode === "create" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Item name</label>
                  <VInput value={verifyForm.itemName} onChange={(e) => setVerifyForm({ ...verifyForm, itemName: e.target.value })} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Category</label>
                    <VDropdown open={verifyCategoryOpen} onOpenChange={setVerifyCategoryOpen} width="w-full"
                      trigger={
                        <button type="button" onClick={() => setVerifyCategoryOpen(!verifyCategoryOpen)}
                          className="w-full h-11 px-3.5 rounded-xl border bg-white text-sm text-left flex items-center justify-between cursor-pointer"
                          style={{ borderColor: c.border, color: verifyForm.category ? c.text : c.textMuted }}>
                          <span>{verifyForm.category || "Select category"}</span>
                          <span className="text-xs" style={{ color: c.textMuted }}>▾</span>
                        </button>
                      }>
                      {(close) => (
                        <>
                          {ITEM_CATEGORIES.map((cat) => (
                            <VDropdownItem key={cat} active={verifyForm.category === cat}
                              onSelect={() => { setVerifyForm({ ...verifyForm, category: cat }); close(); }}>
                              {cat}
                            </VDropdownItem>
                          ))}
                        </>
                      )}
                    </VDropdown>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Found location</label>
                    <VInput value={verifyForm.location} onChange={(e) => setVerifyForm({ ...verifyForm, location: e.target.value })} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Found date</label>
                    <VInput type="date" value={verifyForm.date} onChange={(e) => setVerifyForm({ ...verifyForm, date: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Assign locker (optional)</label>
                    <VDropdown open={lockerOpen} onOpenChange={setLockerOpen} width="w-full"
                      trigger={
                        <button type="button" onClick={() => setLockerOpen(!lockerOpen)}
                          className="w-full h-11 px-3.5 rounded-xl border bg-white text-sm text-left flex items-center justify-between cursor-pointer"
                          style={{ borderColor: c.border, color: verifyForm.lockerId ? c.text : c.textMuted }}>
                          <span>{lockers.find((l) => l.id === verifyForm.lockerId)?.lockerNumber || "Choose a locker"}</span>
                          <span className="text-xs" style={{ color: c.textMuted }}>▾</span>
                        </button>
                      }>
                      {(close) => (
                        <>
                          <VDropdownItem active={!verifyForm.lockerId}
                            onSelect={() => { setVerifyForm({ ...verifyForm, lockerId: "" }); close(); }}>
                            No locker yet
                          </VDropdownItem>
                          {lockers.map((locker) => (
                            <VDropdownItem key={locker.id} active={verifyForm.lockerId === locker.id}
                              onSelect={() => { setVerifyForm({ ...verifyForm, lockerId: locker.id }); close(); }}>
                              <Lock size={13} /> Locker {locker.lockerNumber}
                            </VDropdownItem>
                          ))}
                        </>
                      )}
                    </VDropdown>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Description</label>
                  <VTextarea rows={3} value={verifyForm.description} onChange={(e) => setVerifyForm({ ...verifyForm, description: e.target.value })} />
                </div>
                {verifyReport.images.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>Photos from report</p>
                    <div className={`grid gap-2 ${verifyReport.images.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
                      {verifyReport.images.map((src, index) => (
                        <img key={`${verifyReport.id}-verify-photo-${index}`} src={src} alt={`Report photo ${index + 1}`}
                          className={`w-full object-cover rounded-xl border ${verifyReport.images.length === 1 ? "h-36" : "h-24"}`}
                          style={{ borderColor: c.border }} />
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px]" style={{ color: c.textLight }}>
                  Only verify after the item has been physically handed in. The item will appear in Search immediately.
                </p>
              </div>
            ) : (
              <div>
                <VSearchInput value={linkQuery} onChange={setLinkQuery} placeholder="Search existing found items..." className="mb-3" />
                <div className="space-y-2 max-h-72 overflow-auto">
                  {linkResults.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: c.textLight }}>No found items match your search.</p>
                  ) : linkResults.map((item) => (
                    <button key={item.id} type="button"
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl border text-left cursor-pointer transition-colors"
                      style={{ borderColor: verifyItemId === item.id ? c.primary : c.borderLight, backgroundColor: verifyItemId === item.id ? c.primarySoft : "#fff" }}
                      onClick={() => setVerifyItemId(item.id)}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.itemName} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.fill }}>
                          <Package size={16} style={{ color: c.primary }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{item.itemName}</p>
                        <p className="text-[11px] truncate" style={{ color: c.textMuted }}>
                          {item.foundLocation || "—"} · {fmtDay(item.foundDate)}{item.locker ? ` · Locker ${item.locker.lockerNumber}` : ""}
                        </p>
                      </div>
                      {verifyItemId === item.id && <CheckCircle2 size={16} style={{ color: c.primary }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t" style={{ borderColor: c.borderLight }}>
              <VButton variant="secondary" onClick={() => { if (!verifying) setVerifyReport(null); }}>Cancel</VButton>
              <VButton onClick={handleVerify} disabled={verifying}>
                {verifying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {verifying ? "Verifying..." : "Verify report"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {/* Reject modal */}
      {rejectReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!rejecting) setRejectReport(null); }} />
          <VCard className="relative w-full max-w-md p-6">
            <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Reject this report?</h3>
            <p className="text-xs mb-4" style={{ color: c.textMuted }}>
              {rejectReport.itemName} · {rejectReport.studentName}
            </p>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Reason (optional)</label>
            <VTextarea rows={3} value={rejectNote} maxLength={500} onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Explain why the report cannot be accepted..." />
            <div className="flex items-center justify-end gap-2 mt-4">
              <VButton variant="secondary" onClick={() => { if (!rejecting) setRejectReport(null); }}>Cancel</VButton>
              <VButton variant="danger" onClick={handleReject} disabled={rejecting}>
                {rejecting ? "Rejecting..." : "Reject report"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
