"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Clock, QrCode, CheckCircle2,
  Monitor, Briefcase, CreditCard, Key, BookText, CupSoda, Grid3X3,
  MapPin, Camera, Timer, Lock, X,
} from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import { VCard, VBadge, VPagination, VButton, vcolors as c } from "@/components/ui/vault";

interface User { id: string; name: string; email: string; role: string; }

const filterIcons: Record<string, any> = {
  Electronics: Monitor,
  Bags: Briefcase,
  "Student Cards": CreditCard,
  Keys: Key,
  Documents: BookText,
  "Water Bottles": CupSoda,
  Others: Grid3X3,
};

type ClaimStatus = "Pending" | "Under Review" | "Approved" | "QR Ready" | "Collected" | "Rejected";

const statusConfig: Record<ClaimStatus, { color: string; dot: string }> = {
  Pending: { color: "#64748b", dot: "#94a3b8" },
  "Under Review": { color: "#355C8A", dot: "#355C8A" },
  Approved: { color: "#7FB8B5", dot: "#7FB8B5" },
  "QR Ready": { color: "#29486A", dot: "#29486A" },
  Collected: { color: "#16a34a", dot: "#16a34a" },
  Rejected: { color: "#dc2626", dot: "#dc2626" },
};

type Claim = {
  id: string;
  itemName: string;
  category: string;
  location: string;
  date: string;
  status: ClaimStatus;
  locker?: string;
  evidencePreview?: string | null;
  reason?: string;
};

const mockClaims: Claim[] = [
  { id: "CLM-001", itemName: "MacBook Pro 14\"", category: "Electronics", location: "Library 3rd Floor", date: "2026-07-24", status: "QR Ready", locker: "A12" },
  { id: "CLM-002", itemName: "Brown Leather Wallet", category: "Bags", location: "Student Lounge", date: "2026-07-23", status: "Under Review" },
  { id: "CLM-003", itemName: "AirPods Pro", category: "Electronics", location: "Sports Complex", date: "2026-07-22", status: "Approved", locker: "B07" },
  { id: "CLM-004", itemName: "Student ID Card", category: "Student Cards", location: "Cafeteria", date: "2026-07-21", status: "Pending" },
  { id: "CLM-005", itemName: "Casio G-Shock Watch", category: "Electronics", location: "Main Hall", date: "2026-07-20", status: "Collected" },
  { id: "CLM-006", itemName: "House Keys (4 pcs)", category: "Keys", location: "Bus Stop", date: "2026-07-18", status: "Rejected" },
];

const filters: (ClaimStatus | "All")[] = ["All", "Pending", "Under Review", "Approved", "QR Ready", "Collected", "Rejected"];

export default function StudentClaims() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<ClaimStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [allClaims, setAllClaims] = useState<Claim[]>(mockClaims);
  const [qrModal, setQrModal] = useState<{ claimId: string; locker: string; token: string; expiresAt: string; qrDataUrl: string } | null>(null);
  const [compareClaim, setCompareClaim] = useState<Claim | null>(null);
  const pageSize = 6;

  function foundImageFor(cl: Claim) {
    return `https://picsum.photos/seed/found-${cl.id}/600/400`;
  }

  async function openQR(cl: Claim) {
    let token = `vaultq-${cl.id}-${Date.now().toString(36)}`;
    let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    let qrDataUrl = "";
    // Try real API generation first
    try {
      const t = localStorage.getItem("token");
      const res = await fetch("/api/qrcode/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ claimId: cl.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data?.qrToken) {
        token = data.data.qrToken;
        expiresAt = data.data.expiresAt;
      }
    } catch {}
    try {
      const QRCode = await import("qrcode");
      qrDataUrl = await QRCode.toDataURL(token, { width: 280, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });
    } catch {}
    setQrModal({ claimId: cl.id, locker: cl.locker || "A12", token, expiresAt, qrDataUrl });
    const store = JSON.parse(localStorage.getItem("vaultq_qr") || "{}");
    store[cl.id] = { token, locker: cl.locker || "A12", expiresAt };
    localStorage.setItem("vaultq_qr", JSON.stringify(store));
  }

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
    } else {
      setUser(JSON.parse(stored));
    }
    // Merge local claims with evidence
    try {
      const local = JSON.parse(localStorage.getItem("vaultq_claims") || "[]");
      const mapped: Claim[] = local.map((lc: any) => ({
        id: lc.id,
        itemName: lc.itemName,
        category: lc.category,
        location: lc.location,
        date: lc.date,
        status: "Pending" as ClaimStatus,
        evidencePreview: lc.evidencePreview || null,
        reason: lc.reason,
      }));
      if (mapped.length) setAllClaims([...mapped, ...mockClaims]);
    } catch {}
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out");
    router.push("/login?skip=1");
  }

  if (!user || !mounted) return null;

  const filtered = filter === "All" ? allClaims : allClaims.filter((cl) => cl.status === filter);
  const statusPriority: Record<ClaimStatus, number> = { Pending: 0, "Under Review": 1, Approved: 2, "QR Ready": 3, Collected: 4, Rejected: 5 };
  const sorted = [...filtered].sort((a, b) => {
    const p = statusPriority[a.status] - statusPriority[b.status];
    if (p !== 0) return p;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <StudentShell active="Claims" userName={user.name} userRole={user.role} pageTitle="My Claims" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <div className="flex rounded-xl border bg-white overflow-hidden" style={{ borderColor: c.border }}>
              {filters.map((f) => (
                <button key={f} type="button"
                  className="px-3.5 h-10 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer"
                  style={{
                    backgroundColor: filter === f ? c.primary : "transparent",
                    color: filter === f ? "#fff" : c.textMuted,
                  }}
                  onClick={() => { setFilter(f); setPage(1); }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <FileText size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>No claims found</p>
              <p className="text-sm mt-1" style={{ color: c.textLight }}>No claims with status &quot;{filter}&quot;.</p>
            </VCard>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 flex-1">
                {paginated.map((cl) => {
                  const Icon = filterIcons[cl.category] || Package;
                  const cfg = statusConfig[cl.status];
                  return (
                    <VCard key={cl.id} className="p-5 flex flex-col transition-all duration-200 hover:shadow-lg" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                      <div className="w-full h-40 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden"
                        style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}>
                        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                        <Icon size={40} style={{ color: c.primary, opacity: 0.6 }} />
                      </div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{cl.itemName}</h3>
                        <VBadge color={cfg.color}>{cl.status}</VBadge>
                      </div>
                      <p className="text-[11px] font-medium mb-3" style={{ color: c.textLight }}>{cl.id} · {cl.category}</p>
                      <div className="space-y-1.5 mb-4 text-xs" style={{ color: c.textMuted }}>
                        <p className="flex items-center gap-1.5">
                          <MapPin size={12} style={{ color: c.textMuted }} /> {cl.location}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock size={12} style={{ color: c.textLight }} /> {new Date(cl.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        {cl.locker && (
                          <p className="flex items-center gap-1.5">
                            <Package size={12} style={{ color: c.primary }} /> Locker {cl.locker}
                          </p>
                        )}
                        {cl.reason && (
                          <p className="text-xs p-2 rounded-lg mt-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>&quot;{cl.reason}&quot;</p>
                        )}
                        {cl.evidencePreview && (
                          <button type="button" onClick={() => setCompareClaim(cl)}
                            className="text-xs font-medium mt-2 flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
                            style={{ color: c.primary }}>
                            <Camera size={12} /> Compare photos
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-auto">
                        {cl.status === "QR Ready" && (
                          <button type="button" onClick={() => openQR(cl)}
                            className="flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer"
                            style={{ backgroundColor: c.primary, color: "#fff", boxShadow: "0 2px 6px rgba(53,92,138,0.25)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.primaryDark; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.primary; }}>
                            <QrCode size={14} /> View QR
                          </button>
                        )}
                        {cl.status === "Approved" && (
                          <button type="button"
                            className="flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer"
                            style={{ backgroundColor: c.primary, color: "#fff" }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.primaryDark; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.primary; }}>
                            <CheckCircle2 size={14} /> View Details
                          </button>
                        )}
                        {(cl.status === "Pending" || cl.status === "Under Review") && (
                          <>
                            <button type="button"
                              className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white transition-colors duration-200 cursor-pointer"
                              style={{ borderColor: c.border, color: c.textMuted }}>
                              View Details
                            </button>
                            <button type="button"
                              className="px-4 h-9 rounded-xl text-xs font-medium transition-colors duration-200 cursor-pointer"
                              style={{ backgroundColor: c.borderLight, color: c.textMuted }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.border; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}>
                              Cancel
                            </button>
                          </>
                        )}
                        {(cl.status === "Rejected" || cl.status === "Collected") && (
                          <button type="button"
                            className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white transition-colors duration-200 cursor-pointer"
                            style={{ borderColor: c.border, color: c.textMuted }}>
                            View Details
                          </button>
                        )}
                      </div>
                    </VCard>
                  );
                })}
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

      {compareClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCompareClaim(null)} />
          <VCard className="relative w-full max-w-3xl max-h-[90vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Compare photos</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{compareClaim.itemName} · {compareClaim.id}</p>
              </div>
              <button type="button" onClick={() => setCompareClaim(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer shrink-0" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Found item photo</p>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                  <img src={foundImageFor(compareClaim)} alt="Found item" className="w-full h-64 object-cover bg-[#f8fafc]" />
                  <p className="text-[11px] text-center py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>{compareClaim.location}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Your evidence photo</p>
                {compareClaim.evidencePreview ? (
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                    <img src={compareClaim.evidencePreview} alt="Evidence" className="w-full h-64 object-cover bg-[#f8fafc]" />
                    <p className="text-[11px] text-center py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>Uploaded by you</p>
                  </div>
                ) : (
                  <div className="w-full h-64 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2" style={{ borderColor: c.border, backgroundColor: c.fill, color: c.textLight }}>
                    <Camera size={22} />
                    <span className="text-xs">No evidence uploaded</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end mt-5">
              <VButton variant="secondary" onClick={() => setCompareClaim(null)}>Close</VButton>
            </div>
          </VCard>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setQrModal(null)} />
          <VCard className="relative w-full max-w-sm p-6 text-center">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Locker QR Code</h3>
              <button type="button" onClick={() => setQrModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="w-full aspect-square rounded-2xl border-2 flex items-center justify-center p-4 mb-4" style={{ borderColor: c.border, backgroundColor: "#fff" }}>
              {qrModal.qrDataUrl ? <img src={qrModal.qrDataUrl} alt="QR Code" className="w-full h-full object-contain" /> : <QrCode size={48} style={{ color: c.textMuted }} />}
            </div>
            <p className="text-sm font-semibold flex items-center justify-center gap-1.5" style={{ color: c.text }}><Lock size={14} style={{ color: c.primary }} /> Locker {qrModal.locker}</p>
            <p className="text-xs mt-1" style={{ color: c.textMuted }}>Claim {qrModal.claimId} · Expires {new Date(qrModal.expiresAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-[11px] mt-3 p-2.5 rounded-lg font-mono break-all" style={{ backgroundColor: c.fill, color: c.textMuted }}>{qrModal.token}</p>
            <div className="flex items-center gap-2 mt-4">
              <VButton variant="secondary" className="flex-1" onClick={() => setQrModal(null)}>Close</VButton>
              <VButton className="flex-1" onClick={() => { navigator.clipboard?.writeText(qrModal.token); toast.success("Token copied"); }}>Copy Token</VButton>
            </div>
            <p className="text-[11px] mt-3 flex items-center justify-center gap-1" style={{ color: c.textLight }}><Timer size={12} /> Valid 24h · One-time use</p>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
