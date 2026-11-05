"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Clock, QrCode, CheckCircle2,
  Monitor, Briefcase, CreditCard, Key, BookText, CupSoda, Grid3X3,
  MapPin, Camera, Timer, Lock, X, Loader2, RefreshCw, Eye,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StudentShell } from "@/components/student-shell";
import { EvidenceSlider } from "@/components/evidence-slider";
import { VCard, VBadge, VPagination, VButton, vcolors as c } from "@/components/ui/vault";
import {
  mapUserClaim, CLAIM_STATUS_COLOR,
  type UserClaim, type ClaimDisplayStatus,
} from "@/lib/claim-mapper";

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

const filters: (ClaimDisplayStatus | "All")[] = ["All", "Pending", "Approved", "QR Ready", "Collected", "Rejected"];

const statusPriority: Record<ClaimDisplayStatus, number> = {
  Pending: 0,
  Approved: 1,
  "QR Ready": 2,
  Collected: 3,
  Rejected: 4,
};

function fmtDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtClock(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtTimestamp(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

type QrModal = {
  claimId: string;
  reference: string;
  locker: string | null;
  token: string;
  expiresAt: string;
  qrDataUrl: string;
};

let studentClaimsCache: UserClaim[] | null = null;

export default function StudentClaims() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<ClaimDisplayStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [claims, setClaims] = useState<UserClaim[]>(studentClaimsCache ?? []);
  const [loading, setLoading] = useState(studentClaimsCache === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<QrModal | null>(null);
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null);
  const [detailsClaim, setDetailsClaim] = useState<UserClaim | null>(null);
  const [cancelTarget, setCancelTarget] = useState<UserClaim | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pageSize = 6;

  async function loadClaims(token: string) {
    if (!studentClaimsCache) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/claims", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load claims");
      const mapped = (data.data as any[]).map(mapUserClaim);
      setClaims(mapped);
      studentClaimsCache = mapped;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load claims");
      if (!studentClaimsCache) setClaims([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
      setLoading(false);
      setLoadError("Session expired — please sign in again");
      return;
    }
    setUser(JSON.parse(stored));
    void loadClaims(token);
  }, []);

  function handleLogout() {
    studentClaimsCache = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  async function openQR(cl: UserClaim) {
    if (qrLoadingId) return;
    const token = localStorage.getItem("token");
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }
    setQrLoadingId(cl.id);
    try {
      const res = await fetch("/api/qrcode/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ claimId: cl.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Could not generate QR code");
        return;
      }
      const qr = data.data;
      let qrDataUrl = "";
      try {
        const QRCode = await import("qrcode");
        qrDataUrl = await QRCode.toDataURL(qr.qrToken, { width: 280, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });
      } catch {}
      setQrModal({
        claimId: cl.id,
        reference: cl.reference,
        locker: cl.locker,
        token: qr.qrToken,
        expiresAt: qr.expiresAt,
        qrDataUrl,
      });
      // The server now has a valid QR for this claim.
      setClaims((prev) => prev.map((item) => item.id === cl.id ? { ...item, displayStatus: "QR Ready", hasValidQr: true } : item));
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Could not generate QR code");
    } finally {
      setQrLoadingId(null);
    }
  }

  async function handleCancel() {
    if (!cancelTarget || cancelling) return;
    const target = cancelTarget;
    const token = localStorage.getItem("token");
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      setCancelTarget(null);
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/claims/${target.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to cancel claim");
        return;
      }
      setClaims((prev) => prev.filter((cl) => cl.id !== target.id));
      setDetailsClaim((prev) => (prev && prev.id === target.id ? null : prev));
      showCenteredMessage("success", "Claim cancelled");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to cancel claim");
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }

  if (!user || !mounted) return null;

  const filtered = filter === "All" ? claims : claims.filter((cl) => cl.displayStatus === filter);
  const sorted = [...filtered].sort((a, b) => {
    const p = statusPriority[a.displayStatus] - statusPriority[b.displayStatus];
    if (p !== 0) return p;
    return new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime();
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <StudentShell active="Claims" userName={user.name} userRole={user.role} pageTitle="My Claims" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <div className="flex flex-wrap rounded-xl border bg-white overflow-hidden" style={{ borderColor: c.border }}>
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

          {loading ? null : loadError ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <FileText size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load claims</p>
              <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{loadError}</p>
              <VButton variant="secondary" onClick={() => { const t = localStorage.getItem("token"); if (t) void loadClaims(t); }}>
                <RefreshCw size={14} /> Try again
              </VButton>
            </VCard>
          ) : sorted.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <FileText size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>
                {claims.length === 0 ? "No claims yet" : "No claims found"}
              </p>
              <p className="text-sm mt-1" style={{ color: c.textLight }}>
                {claims.length === 0
                  ? "Search for a found item and submit a claim with photo evidence."
                  : `No claims with status "${filter}".`}
              </p>
            </VCard>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 flex-1">
                {paginated.map((cl) => {
                  const Icon = filterIcons[cl.category] || Package;
                  const statusColor = CLAIM_STATUS_COLOR[cl.displayStatus];
                  const canShowQr = cl.displayStatus === "Approved" || cl.displayStatus === "QR Ready";
                  return (
                    <VCard key={cl.id} className="p-5 flex flex-col transition-all duration-200 hover:shadow-lg" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                      <div className="w-full h-40 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden"
                        style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}>
                        {cl.itemImageUrl ? (
                          <img src={cl.itemImageUrl} alt={cl.itemName} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <>
                            <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                            <Icon size={40} style={{ color: c.primary, opacity: 0.6 }} />
                          </>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{cl.itemName}</h3>
                        <VBadge color={statusColor}>{cl.displayStatus}</VBadge>
                      </div>
                      <p className="text-[11px] font-medium mb-3 flex items-center gap-1" style={{ color: c.textLight }}>
                        <Icon size={12} style={{ color: c.primary }} /> {cl.category}
                      </p>
                      <div className="space-y-1.5 mb-4 text-xs" style={{ color: c.textMuted }}>
                        <p className="flex items-center gap-1.5">
                          <MapPin size={12} style={{ color: c.textMuted }} /> {cl.location || "—"}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock size={12} style={{ color: c.textLight }} /> Found {fmtDay(cl.foundDate)}
                        </p>
                        {cl.locker && (
                          <p className="flex items-center gap-1.5">
                            <Package size={12} style={{ color: c.primary }} /> Locker {cl.locker}
                          </p>
                        )}
                        {cl.reason && (
                          <p className="text-xs p-2 rounded-lg mt-2 line-clamp-3" style={{ backgroundColor: c.fill, color: c.textMuted }}>
                            <span className="font-semibold" style={{ color: c.text }}>Claim reason: </span>
                            &quot;{cl.reason}&quot;
                          </p>
                        )}

                      </div>
                      <div className="flex items-center gap-2 mt-auto">
                        {canShowQr && (
                          <>
                            <button type="button" onClick={() => setDetailsClaim(cl)}
                              className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                              style={{ borderColor: c.border, color: c.textMuted }}>
                              <Eye size={13} /> Details
                            </button>
                            <button type="button" onClick={() => openQR(cl)} disabled={qrLoadingId === cl.id}
                              className="flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer disabled:opacity-60"
                              style={{ backgroundColor: c.primary, color: "#fff", boxShadow: "0 2px 6px rgba(53,92,138,0.25)" }}
                              onMouseEnter={(e) => { if (qrLoadingId !== cl.id) e.currentTarget.style.backgroundColor = c.primaryDark; }}
                              onMouseLeave={(e) => { if (qrLoadingId !== cl.id) e.currentTarget.style.backgroundColor = c.primary; }}>
                              {qrLoadingId === cl.id ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                              {qrLoadingId === cl.id ? "Preparing..." : cl.displayStatus === "QR Ready" ? "View QR" : "Get QR Code"}
                            </button>
                          </>
                        )}
                        {cl.displayStatus === "Pending" && (
                          <>
                            <button type="button" onClick={() => setDetailsClaim(cl)}
                              className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white transition-colors duration-200 cursor-pointer"
                              style={{ borderColor: c.border, color: c.textMuted }}>
                              <Eye size={13} className="inline mr-1" /> Details
                            </button>
                            <button type="button" onClick={() => setCancelTarget(cl)}
                              className="px-4 h-9 rounded-xl text-xs font-medium transition-colors duration-200 cursor-pointer"
                              style={{ backgroundColor: c.borderLight, color: c.textMuted }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.border; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}>
                              Cancel
                            </button>
                          </>
                        )}
                        {(cl.displayStatus === "Rejected" || cl.displayStatus === "Collected") && (
                          <button type="button" onClick={() => setDetailsClaim(cl)}
                            className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                            style={{ borderColor: c.border, color: c.textMuted }}>
                            <Eye size={13} /> View Details
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

      {/* Claim details / photo comparison */}
      {detailsClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetailsClaim(null)} />
          <VCard className="relative w-full max-w-3xl max-h-[90vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Claim Details</h3>
              </div>
              <button type="button" onClick={() => setDetailsClaim(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer shrink-0" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>



            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Found item photo</p>
                {detailsClaim.itemImageUrls?.length ? (
                  <EvidenceSlider
                    photos={detailsClaim.itemImageUrls}
                    alt="Found item"
                    caption={`${fmtDay(detailsClaim.foundDate)}${detailsClaim.itemCreatedAt ? ` · ${fmtClock(detailsClaim.itemCreatedAt)}` : ""}`}
                    label="found item"
                  />
                ) : (
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                    <div className="w-full h-64 flex items-center justify-center" style={{ backgroundColor: c.fill, color: c.textLight }}>
                      {(() => { const Icon = filterIcons[detailsClaim.category] || Package; return <Icon size={40} />; })()}
                    </div>
                    <p className="text-[11px] text-center py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>
                      {fmtDay(detailsClaim.foundDate)}
                      {detailsClaim.itemCreatedAt && ` · ${fmtClock(detailsClaim.itemCreatedAt)}`}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Your evidence photo</p>
                {(detailsClaim.evidenceImageUrls?.length || detailsClaim.evidenceImageUrl) ? (
                  <EvidenceSlider
                    photos={detailsClaim.evidenceImageUrls?.length ? detailsClaim.evidenceImageUrls : [detailsClaim.evidenceImageUrl!]}
                    alt="Evidence"
                    caption={fmtTimestamp(detailsClaim.evidenceUploadedAt)}
                    label="evidence"
                  />
                ) : (
                  <div className="w-full h-64 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2" style={{ borderColor: c.border, backgroundColor: c.fill, color: c.textLight }}>
                    <Camera size={22} />
                    <span className="text-xs">No evidence uploaded</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {detailsClaim.approvedAt && (
                <p className="text-xs mr-auto" style={{ color: c.textMuted }}>
                  Approved by admin on {fmtTimestamp(detailsClaim.approvedAt)}
                </p>
              )}
              <VButton variant="secondary" onClick={() => setDetailsClaim(null)}>Close</VButton>
              {detailsClaim.displayStatus === "Pending" && (
                <VButton variant="danger" onClick={() => { const target = detailsClaim; setDetailsClaim(null); setCancelTarget(target); }}>
                  Cancel claim
                </VButton>
              )}
              {(detailsClaim.displayStatus === "Approved" || detailsClaim.displayStatus === "QR Ready") && (
                <VButton onClick={() => { const target = detailsClaim; setDetailsClaim(null); void openQR(target); }}>
                  <QrCode size={14} /> {detailsClaim.displayStatus === "QR Ready" ? "View QR" : "Get QR Code"}
                </VButton>
              )}
            </div>
          </VCard>
        </div>
      )}

      {/* Locker QR */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setQrModal(null)} />
          <VCard className="relative w-full max-w-sm p-6 text-center">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Pickup QR Code</h3>
              <button type="button" onClick={() => setQrModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="w-full aspect-square rounded-2xl border-2 flex items-center justify-center p-4 mb-4" style={{ borderColor: c.border, backgroundColor: "#fff" }}>
              {qrModal.qrDataUrl ? <img src={qrModal.qrDataUrl} alt="QR Code" className="w-full h-full object-contain" /> : <QrCode size={48} style={{ color: c.textMuted }} />}
            </div>
            <p className="text-sm font-semibold flex items-center justify-center gap-1.5" style={{ color: c.text }}>
              <Lock size={14} style={{ color: c.primary }} />
              {qrModal.locker ? `Locker ${qrModal.locker}` : "Locker pending assignment"}
            </p>
            <p className="text-xs mt-1" style={{ color: c.textMuted }}>Expires {fmtTimestamp(qrModal.expiresAt)}</p>
            <p className="text-xs mt-3 p-3 rounded-lg leading-relaxed" style={{ backgroundColor: c.primarySoft, color: c.primary }}>
              At the locker kiosk, scan your registered student ID barcode first, then scan this QR code to unlock the locker and collect your item.
            </p>
            <p className="text-[11px] mt-3 p-2.5 rounded-lg font-mono break-all" style={{ backgroundColor: c.fill, color: c.textMuted }}>{qrModal.token}</p>
            <div className="flex items-center gap-2 mt-4">
              <VButton variant="secondary" className="flex-1" onClick={() => setQrModal(null)}>Close</VButton>
              <VButton className="flex-1" onClick={() => { navigator.clipboard?.writeText(qrModal.token); showCenteredMessage("success", "Token copied"); }}>Copy Token</VButton>
            </div>
            <p className="text-[11px] mt-3 flex items-center justify-center gap-1" style={{ color: c.textLight }}><Timer size={12} /> Valid 24h · One-time use · Self-service locker</p>
          </VCard>
        </div>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel this claim?"
        subtitle={cancelTarget ? cancelTarget.itemName : undefined}
        cancelLabel="Keep claim"
        confirmLabel={cancelling ? "Cancelling..." : "Cancel claim"}
        onCancel={() => { if (!cancelling) setCancelTarget(null); }}
        onConfirm={handleCancel}
      />
    </StudentShell>
  );
}
