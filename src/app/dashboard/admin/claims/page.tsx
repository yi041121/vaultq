"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Grid3X3, Lock, FileText, Users, Search, Clock, MapPin,
  CheckCircle2, XCircle, Eye, RotateCcw, Camera, X, PackageSearch, QrCode,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VBadge, VButton, VInput, VSearchInput, VPagination, vcolors as c,
} from "@/components/ui/vault";

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Reports", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

type Claim = {
  id: string;
  itemName: string;
  category: string;
  student: string;
  studentId: string;
  location: string;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  locker?: string;
  evidencePreview?: string | null;
  itemImageUrl?: string | null;
};

const statusOptions = ["All", "PENDING", "APPROVED", "REJECTED"] as const;

function statusColor(s: string) {
  switch (s) {
    case "PENDING": return "#64748b";
    case "APPROVED": return "#16a34a";
    case "REJECTED": return "#dc2626";
    default: return "#64748b";
  }
}

export default function AdminClaims() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<typeof statusOptions[number]>("All");
  const [page, setPage] = useState(1);
  const [compareClaim, setCompareClaim] = useState<Claim | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState("");
  const [qrVerifying, setQrVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageSize = 6;

  function authHeaders(): Record<string, string> {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function mapApiClaim(raw: any): Claim {
    return {
      id: raw.id,
      itemName: raw.item?.itemName || "Unknown item",
      category: raw.item?.category || "Others",
      student: raw.user?.name || "Unknown",
      studentId: raw.user?.studentId || "—",
      location: raw.item?.foundLocation || "",
      date: String(raw.createdAt || "").slice(0, 10),
      status: raw.status,
      reason: raw.claimReason || "",
      locker: raw.item?.locker?.lockerNumber,
      evidencePreview: raw.evidenceImageUrl || null,
      itemImageUrl: raw.item?.imageUrl || null,
    };
  }

  async function fetchClaims(openId?: string | null) {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/claims", { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load claims");
      const mapped = (data.data as any[]).map(mapApiClaim);
      setClaims(mapped);
      if (openId) {
        const target = mapped.find((c) => c.id === openId);
        if (target) {
          setCompareClaim(target);
          showCenteredMessage("success", "Opened claim from dashboard");
        }
      }
    } catch (e) {
      setClaims([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
    // Merge student evidence claims
    let openId: string | null = null;
    if (typeof window !== "undefined") {
      openId = new URLSearchParams(window.location.search).get("open");
      if (openId) window.history.replaceState(null, "", window.location.pathname);
    }
    fetchClaims(openId);
  }, []);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/login?skip=1&loggedOut=1"); }
  if (!user || !mounted) return null;

  const filtered = claims.filter((cl) => {
    if (query && !`${cl.itemName} ${cl.student} ${cl.id}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (statusFilter !== "All" && cl.status !== statusFilter) return false;
    return true;
  });

  const statusPriority: Record<Claim["status"], number> = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const p = statusPriority[a.status] - statusPriority[b.status];
    if (p !== 0) return p;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = !!(query || statusFilter !== "All");

  async function firstAvailableLocker(): Promise<string | null> {
    try {
      const res = await fetch("/api/lockers?status=AVAILABLE", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.data) && data.data.length) return data.data[0].lockerNumber;
    } catch {}
    return null;
  }

  async function handleApprove(id: string) {
    try {
      const target = claims.find((claim) => claim.id === id);
      // Keep an already-assigned locker; only allocate one when the item has none.
      const lockerNumber = target?.locker ? null : await firstAvailableLocker();
      const res = await fetch(`/api/claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "approve", ...(lockerNumber ? { lockerNumber } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Approve failed");
      const assigned = lockerNumber || target?.locker;
      showCenteredMessage("success", assigned ? `Claim approved — locker ${assigned} assigned` : "Claim approved");
      await fetchClaims();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Approve failed");
    }
  }

  async function handleReject(id: string) {
    try {
      const res = await fetch(`/api/claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "reject" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Reject failed");
      showCenteredMessage("success", "Claim rejected");
      await fetchClaims();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Reject failed");
    }
  }

  async function handleVerifyQr() {
    const token = qrToken.trim();
    if (!token) {
      showCenteredMessage("error", "Scan or paste the student's QR token");
      return;
    }
    if (qrVerifying) return;
    setQrVerifying(true);
    try {
      const res = await fetch("/api/qrcode/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data.error || "QR verification failed");
        return;
      }
      const itemName = data.data?.itemName || "Item";
      const locker = data.data?.locker;
      showCenteredMessage(
        "success",
        locker ? `${itemName} collected — locker ${locker} released` : `${itemName} collected`,
      );
      setQrOpen(false);
      setQrToken("");
      await fetchClaims();
    } catch {
      showCenteredMessage("error", "QR verification failed");
    } finally {
      setQrVerifying(false);
    }
  }

  return (
    <StudentShell active="Claims" userName={user.name} userRole={user.role} pageTitle="Claim Verification" bottomNav={adminNav} logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full h-full flex flex-col">
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="flex-1 min-w-[220px] max-w-xl" placeholder="Search claim, item or student..." />
            <div className="flex h-10 rounded-xl border bg-white overflow-hidden shrink-0" style={{ borderColor: c.border }}>
              {statusOptions.map((s) => (
                <button key={s} type="button"
                  className="px-3.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer"
                  style={{ backgroundColor: statusFilter === s ? c.primary : "transparent", color: statusFilter === s ? "#fff" : c.textMuted }}
                  onClick={() => { setStatusFilter(s); setPage(1); }}>
                  {s === "All" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {hasFilters && (
              <button type="button"
                className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-medium border bg-white transition-all duration-200 cursor-pointer"
                style={{ borderColor: c.borderLight, color: c.primary, fontWeight: "600" }}
                onClick={() => { setQuery(""); setStatusFilter("All"); setPage(1); }}>
                <RotateCcw size={13} /><span>Reset</span>
              </button>
            )}
            <VButton
              variant="secondary"
              className="ml-auto"
              onClick={() => { setQrToken(""); setQrOpen(true); }}
            >
              <QrCode size={14} /> Verify pickup QR
            </VButton>
          </div>

          {loading ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Loading claims...</p>
            </VCard>
          ) : loadError ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load claims</p>
              <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{loadError}</p>
              <VButton variant="secondary" onClick={() => void fetchClaims()}>
                <RotateCcw size={14} /> Try again
              </VButton>
            </VCard>
          ) : sorted.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>No claims found</p>
              <p className="text-sm mt-1" style={{ color: c.textLight }}>Try adjusting filters.</p>
            </VCard>
          ) : (
            <>
              <div className="space-y-4 flex-1">
                {paginated.map((cl) => (
                  <VCard key={cl.id} className="p-5 flex flex-col gap-4 cursor-pointer hover:shadow-md transition-shadow duration-200" onClick={() => setCompareClaim(cl)}>
                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 hidden lg:flex"
                        style={{ backgroundColor: `${statusColor(cl.status)}15` }}>
                        <FileText size={20} style={{ color: statusColor(cl.status) }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold" style={{ color: c.text }}>{cl.itemName}</h3>
                          <VBadge color={statusColor(cl.status)}>{cl.status}</VBadge>
                          <span className="text-xs" style={{ color: c.textLight }}>{cl.id} · {cl.category}</span>
                        </div>
                        <p className="text-xs" style={{ color: c.textMuted }}>{cl.student} ({cl.studentId}) · {cl.location}</p>
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: c.textMuted }}><Clock size={12} /> {new Date(cl.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {cl.locker && <>· <Lock size={12} /> Locker {cl.locker}</>}</p>
                        <p className="text-xs mt-2 p-2.5 rounded-lg" style={{ backgroundColor: c.fill, color: c.textMuted }}>&quot;{cl.reason}&quot;</p>
                        <p className="text-[11px] mt-2 flex items-center gap-1" style={{ color: c.textLight }}><Camera size={11} /> Click to compare photos and verify</p>
                      </div>
                      <div className="flex items-center gap-2 lg:flex-col xl:flex-row shrink-0" onClick={(e) => e.stopPropagation()}>
                        <VButton variant="outline" size="md" onClick={() => setCompareClaim(cl)}><Eye size={14} /> View</VButton>
                      </div>
                    </div>
                  </VCard>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
                <span className="text-xs" style={{ color: c.textMuted }}>
                  Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length} results
                </span>
                <VPagination current={currentPage} total={totalPages} onPage={setPage} />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Compare photos pop-out */}
      {compareClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCompareClaim(null)} />
          <VCard className="relative w-full max-w-3xl max-h-[90vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Compare photos</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{compareClaim.itemName} · {compareClaim.id} · {compareClaim.student} ({compareClaim.studentId})</p>
              </div>
              <button type="button" onClick={() => setCompareClaim(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer shrink-0" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-4 p-2.5 rounded-lg" style={{ backgroundColor: c.fill, color: c.textMuted }}>&quot;{compareClaim.reason}&quot;</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Found item photo</p>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                  {compareClaim.itemImageUrl ? (
                    <img src={compareClaim.itemImageUrl} alt="Found item" className="w-full h-64 object-cover bg-[#f8fafc]" />
                  ) : (
                    <div className="w-full h-64 flex flex-col items-center justify-center gap-2 bg-[#f8fafc]" style={{ color: c.textLight }}>
                      <Package size={36} />
                      <span className="text-xs">No item photo uploaded</span>
                    </div>
                  )}
                  <p className="text-[11px] text-center py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>{compareClaim.location} · {compareClaim.date}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Student evidence photo</p>
                {compareClaim.evidencePreview ? (
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                    <img src={compareClaim.evidencePreview} alt="Evidence" className="w-full h-64 object-cover bg-[#f8fafc]" />
                    <p className="text-[11px] text-center py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>Uploaded by {compareClaim.student}</p>
                  </div>
                ) : (
                  <div className="w-full h-64 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2" style={{ borderColor: c.border, backgroundColor: c.fill, color: c.textLight }}>
                    <Camera size={22} />
                    <span className="text-xs">No photo evidence provided</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5" onClick={(e) => e.stopPropagation()}>
              <VButton variant="secondary" onClick={() => setCompareClaim(null)}>Close</VButton>
              {compareClaim.status === "PENDING" ? (
                <>
                  <VButton variant="danger" onClick={() => { handleReject(compareClaim.id); setCompareClaim(null); }}><XCircle size={14} /> Reject</VButton>
                  <VButton onClick={() => { handleApprove(compareClaim.id); setCompareClaim(null); }}><CheckCircle2 size={14} /> Approve</VButton>
                </>
              ) : (
                <VBadge color={statusColor(compareClaim.status)}>{compareClaim.status}</VBadge>
              )}
            </div>
          </VCard>
        </div>
      )}

      {/* Staff QR verification */}
      {qrOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!qrVerifying) setQrOpen(false); }} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Verify pickup QR</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>
                  Scan or paste the QR shown in the student&apos;s My Claims. The item is marked collected and its locker released.
                </p>
              </div>
              <button type="button" onClick={() => { if (!qrVerifying) setQrOpen(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <div className="rounded-xl p-3 mb-4 flex items-start gap-2.5" style={{ backgroundColor: c.fill }}>
              <QrCode size={16} className="shrink-0 mt-0.5" style={{ color: c.primary }} />
              <p className="text-xs leading-relaxed" style={{ color: c.textMuted }}>
                Students present this code at the counter or kiosk scanner. It is valid for 24 hours and can only be used once.
              </p>
            </div>

            <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>QR token</label>
            <VInput
              autoFocus
              value={qrToken}
              onChange={(e) => setQrToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleVerifyQr(); }}
              placeholder="Scan or paste QR token"
            />

            <div className="flex items-center justify-end gap-2 mt-5">
              <VButton variant="secondary" onClick={() => { if (!qrVerifying) setQrOpen(false); }}>Cancel</VButton>
              <VButton onClick={() => void handleVerifyQr()} disabled={qrVerifying || !qrToken.trim()}>
                {qrVerifying ? "Verifying..." : "Verify QR"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
