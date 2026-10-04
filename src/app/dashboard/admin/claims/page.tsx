"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Grid3X3, Lock, FileText, Users, Search, Clock, MapPin,
  CheckCircle2, XCircle, Eye, RotateCcw, Camera, X,
} from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VBadge, VButton, VSearchInput, VPagination, vcolors as c,
} from "@/components/ui/vault";

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
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
};

const initialClaims: Claim[] = [
  { id: "CLM-001", itemName: "MacBook Pro 14\"", category: "Electronics", student: "Alex Tan", studentId: "S12345", location: "Library 3rd Floor", date: "2026-07-24", status: "PENDING", reason: "Lost during study session, has Apple sticker on lid.", evidencePreview: "https://picsum.photos/seed/vaultq-evidence-1/600/400" },
  { id: "CLM-002", itemName: "Brown Leather Wallet", category: "Bags", location: "Student Lounge", date: "2026-07-23", status: "PENDING", student: "Sarah Lim", studentId: "S12346", reason: "Contains IC and student card, brown leather with zip.", evidencePreview: "https://picsum.photos/seed/vaultq-evidence-2/600/400" },
  { id: "CLM-003", itemName: "AirPods Pro", category: "Electronics", location: "Sports Complex", date: "2026-07-22", status: "APPROVED", student: "John Doe", studentId: "S12347", reason: "White case with scratch on lid.", locker: "B07" },
  { id: "CLM-004", itemName: "Student ID Card", category: "Student Cards", location: "Cafeteria", date: "2026-07-21", status: "PENDING", student: "Emily Chen", studentId: "S12348", reason: "Lost ID, photo matches." },
  { id: "CLM-005", itemName: "Casio G-Shock Watch", category: "Electronics", location: "Main Hall", date: "2026-07-20", status: "REJECTED", student: "Mike Lee", studentId: "S12349", reason: "Description does not match item details." },
  { id: "CLM-006", itemName: "House Keys (4 pcs)", category: "Keys", location: "Bus Stop", date: "2026-07-18", status: "PENDING", student: "Lisa Wong", studentId: "S12350", reason: "Silver keys with blue keychain." },
];

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
  const [claims, setClaims] = useState<Claim[]>(initialClaims);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<typeof statusOptions[number]>("All");
  const [page, setPage] = useState(1);
  const [compareClaim, setCompareClaim] = useState<Claim | null>(null);
  const pageSize = 6;

  function foundImageFor(cl: Claim) {
    return `https://picsum.photos/seed/found-${cl.id}/600/400`;
  }

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
    // Merge student evidence claims
    let merged = initialClaims;
    try {
      const local = JSON.parse(localStorage.getItem("vaultq_claims") || "[]");
      const mapped: Claim[] = local.map((lc: any) => ({
        id: lc.id,
        itemName: lc.itemName,
        category: lc.category,
        student: "Current Student",
        studentId: "S99999",
        location: lc.location,
        date: lc.date,
        status: "PENDING" as const,
        reason: lc.reason,
        evidencePreview: lc.evidencePreview || null,
      }));
      if (mapped.length) {
        merged = [...mapped, ...initialClaims];
        setClaims(merged);
      }
    } catch {}
    if (typeof window !== "undefined") {
      const openId = new URLSearchParams(window.location.search).get("open");
      if (openId) {
        const target = merged.find((c) => c.id === openId);
        if (target) {
          setCompareClaim(target);
          toast.info(`Opened ${target.id} from dashboard`);
        }
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); toast.success("Logged out"); router.push("/login?skip=1"); }
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

  function handleApprove(id: string) {
    setClaims(claims.map((cl) => cl.id === id ? { ...cl, status: "APPROVED" as const, locker: "A12" } : cl));
    toast.success("Claim approved — locker assigned");
  }
  function handleReject(id: string) {
    setClaims(claims.map((cl) => cl.id === id ? { ...cl, status: "REJECTED" as const } : cl));
    toast.success("Claim rejected");
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
          </div>

          {sorted.length === 0 ? (
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
                  <img src={foundImageFor(compareClaim)} alt="Found item" className="w-full h-64 object-cover bg-[#f8fafc]" />
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
    </StudentShell>
  );
}
