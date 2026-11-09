"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Clock, QrCode, CheckCircle2,
  Monitor, Briefcase, CreditCard, Key, BookText, CupSoda, Grid3X3,
  MapPin, Camera, Timer, Lock, X, Loader2, RefreshCw, Eye,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StudentShell } from "@/components/student-shell";
import { useEscapeKey } from "@/lib/use-escape-key";
import { EvidenceSlider } from "@/components/evidence-slider";
import { compressImageFile } from "@/lib/image-compression";
import { PhotoPicker } from "@/components/photo-picker";
import { PhotoSourceDialog } from "@/components/photo-source-dialog";
import { CameraCaptureModal } from "@/components/camera-capture-modal";
import { VCard, VBadge, VPagination, VButton, VTextarea, vcolors as c } from "@/components/ui/vault";
import {
  mapUserClaim, CLAIM_STATUS_COLOR,
  type UserClaim, type ClaimDisplayStatus,
} from "@/lib/claim-mapper";
import { clearStudentCache, getCachedClaims, setCachedClaims } from "@/lib/student-cache";

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

const filters: (ClaimDisplayStatus | "All")[] = ["All", "Pending", "QR Ready", "Collected", "Rejected"];

const statusPriority: Record<ClaimDisplayStatus, number> = {
  Pending: 0,
  "QR Ready": 1,
  Collected: 2,
  Rejected: 3,
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

export default function StudentClaims() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<ClaimDisplayStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [claims, setClaims] = useState<UserClaim[]>(() => getCachedClaims() ?? []);
  const [loading, setLoading] = useState(() => getCachedClaims() === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<QrModal | null>(null);
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null);
  const [detailsClaim, setDetailsClaim] = useState<UserClaim | null>(null);
  const [cancelTarget, setCancelTarget] = useState<UserClaim | null>(null);
  const [resubmitClaim, setResubmitClaim] = useState<UserClaim | null>(null);
  const [resubmitReason, setResubmitReason] = useState("");
  const [resubmitPhotos, setResubmitPhotos] = useState<{ file?: File; preview: string; existing?: boolean }[]>([]);
  const [resubmitting, setResubmitting] = useState(false);
  const resubmitInputRef = useRef<HTMLInputElement>(null);
  const resubmitCameraRef = useRef<HTMLInputElement>(null);
  const [resubmitSourceOpen, setResubmitSourceOpen] = useState(false);
  const [resubmitCameraOpen, setResubmitCameraOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pageSize = 6;

  async function loadClaims(token: string) {
    if (!getCachedClaims()) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/claims", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load claims");
      const mapped = (data.data as any[]).map(mapUserClaim);
      setClaims(mapped);
      setCachedClaims(mapped);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load claims");
      if (!getCachedClaims()) setClaims([]);
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
    clearStudentCache();
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

  function openResubmit(cl: UserClaim) {
    setResubmitClaim(cl);
    setResubmitReason(cl.reason || "");
    setResubmitPhotos((cl.evidenceImageUrls || []).map((preview) => ({ preview, existing: true })));
    if (resubmitInputRef.current) resubmitInputRef.current.value = "";
  }

  function openResubmitCamera() {
    if (window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function") {
      setResubmitCameraOpen(true);
      return;
    }
    resubmitCameraRef.current?.click();
  }

  async function handleResubmitFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (resubmitPhotos.length + files.length > 3) {
      showCenteredMessage("error", "You can upload up to 3 photos");
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
        showCenteredMessage("error", "Please upload image files only");
        return;
      }
    }
    try {
      const drafts = await Promise.all(
        files.map(async (file) => {
          const compressed = await compressImageFile(file);
          return { file: compressed.file, preview: compressed.preview };
        }),
      );
      setResubmitPhotos((prev) => [...prev, ...drafts].slice(0, 3));
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Could not process one of the images");
    }
  }

  async function handleResubmit() {
    if (!resubmitClaim || resubmitting) return;
    if (!resubmitReason.trim()) {
      showCenteredMessage("error", "Please describe why this item is yours");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;
    setResubmitting(true);
    try {
      const keepImages = resubmitPhotos.filter((photo) => photo.existing).map((photo) => photo.preview);
      if (!resubmitPhotos.length) {
        showCenteredMessage("error", "Please keep or add at least one photo");
        return;
      }
      const form = new FormData();
      form.append("claimReason", resubmitReason.trim());
      form.append("keepImages", JSON.stringify(keepImages));
      resubmitPhotos.forEach((photo) => { if (photo.file) form.append("evidence", photo.file); });
      const res = await fetch(`/api/claims/${resubmitClaim.id}/resubmit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data.error || "Failed to resubmit claim");
      showCenteredMessage("success", "Claim resubmitted — awaiting verification");
      setResubmitClaim(null);
      setResubmitPhotos([]);
      await loadClaims(token);
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Failed to resubmit claim");
    } finally {
      setResubmitting(false);
    }
  }

  useEscapeKey(!!detailsClaim, () => setDetailsClaim(null));

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
      <main className="min-h-[calc(100vh-52px)] pb-28 lg:pb-6 flex flex-col">
        <div className="px-4 sm:px-6 lg:px-12 pt-6 lg:pt-8 w-full flex-1 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 lg:mb-7">
            <div className="flex flex-wrap items-center gap-2">
              {filters.map((f) => {
                const active = filter === f;
                return (
                  <button key={f} type="button"
                    className="h-10 px-4 rounded-xl text-sm font-medium border whitespace-nowrap transition-colors duration-150 cursor-pointer"
                    style={{
                      backgroundColor: active ? c.primary : "#fff",
                      borderColor: active ? c.primary : c.border,
                      color: active ? "#fff" : c.textMuted,
                      boxShadow: active ? "0 2px 6px rgba(53,92,138,0.22)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (active) return;
                      e.currentTarget.style.backgroundColor = c.primarySoft;
                      e.currentTarget.style.borderColor = c.primary;
                      e.currentTarget.style.color = c.primary;
                    }}
                    onMouseLeave={(e) => {
                      if (active) return;
                      e.currentTarget.style.backgroundColor = "#fff";
                      e.currentTarget.style.borderColor = c.border;
                      e.currentTarget.style.color = c.textMuted;
                    }}
                    onClick={() => { setFilter(f); setPage(1); }}>
                    {f}
                  </button>
                );
              })}
            </div>
            {!loading && !loadError && (
              <span className="hidden sm:inline text-sm font-medium tabular-nums" style={{ color: c.textMuted }}>
                {sorted.length} {sorted.length === 1 ? "claim" : "claims"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-5 content-start flex-1" aria-busy="true" aria-label="Loading claims">
              {Array.from({ length: 6 }).map((_, i) => (
                <VCard key={i} className="h-full p-5 flex flex-col" style={{ borderRadius: 22, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
                  <div className="flex items-start gap-4 min-h-[105px]">
                    <div className="w-24 h-24 rounded-2xl shrink-0" style={{ backgroundColor: c.fill }} />
                    <div className="flex-1 min-w-0 pt-1 space-y-1.5">
                      <div className="h-4 w-4/5 rounded-md" style={{ backgroundColor: c.fill }} />
                      <div className="h-3 w-3/5 rounded-md" style={{ backgroundColor: c.fill }} />
                      <div className="h-3 w-2/3 rounded-md" style={{ backgroundColor: c.fill }} />
                      <div className="h-3 w-1/2 rounded-md" style={{ backgroundColor: c.fill }} />
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border p-3" style={{ backgroundColor: c.primarySoft, borderColor: "#d7e3ef" }}>
                    <div className="h-3 w-24 rounded-md mb-1.5" style={{ backgroundColor: "#cbd9e6" }} />
                    <div className="space-y-2 min-h-[42px]">
                      <div className="h-3 w-full rounded-md" style={{ backgroundColor: "#d7e3ee" }} />
                      <div className="h-3 w-5/6 rounded-md" style={{ backgroundColor: "#d7e3ee" }} />
                    </div>
                  </div>
                  <div className="mt-auto pt-5">
                    <div className="flex items-center gap-2.5 border-t pt-4" style={{ borderColor: c.borderLight }}>
                      <div className="h-10 flex-1 rounded-xl" style={{ backgroundColor: c.fill }} />
                      <div className="h-10 flex-1 rounded-xl" style={{ backgroundColor: c.fill }} />
                    </div>
                  </div>
                </VCard>
              ))}
            </div>
          ) : loadError ? (
            <VCard className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16" style={{ borderRadius: 22, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: "#fef2f2" }}>
                <FileText size={28} style={{ color: c.danger }} />
              </div>
              <p className="text-lg font-semibold" style={{ color: c.text }}>Could not load claims</p>
              <p className="text-sm mt-2 max-w-md leading-relaxed" style={{ color: c.textMuted }}>{loadError}</p>
              <VButton variant="primary" className="mt-6" onClick={() => { const t = localStorage.getItem("token"); if (t) void loadClaims(t); }}>
                <RefreshCw size={14} /> Try again
              </VButton>
            </VCard>
          ) : sorted.length === 0 ? (
            <VCard className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16" style={{ borderRadius: 22, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: c.primarySoft }}>
                <FileText size={28} style={{ color: c.primary }} />
              </div>
              <p className="text-lg font-semibold" style={{ color: c.text }}>
                {claims.length === 0 ? "No claims yet" : "No claims found"}
              </p>
              <p className="text-sm mt-2 max-w-md leading-relaxed" style={{ color: c.textMuted }}>
                {claims.length === 0
                  ? "Found something that belongs to you? Search the item inventory and submit a claim with photo evidence."
                  : `You don't have any claims with status "${filter}". Try a different filter to see your other claims.`}
              </p>
              <VButton
                variant={claims.length === 0 ? "primary" : "outline"}
                className="mt-6"
                onClick={() => {
                  if (claims.length === 0) {
                    router.push("/dashboard/student/search");
                  } else {
                    setFilter("All");
                    setPage(1);
                  }
                }}>
                {claims.length === 0 ? "Browse found items" : "Show all claims"}
              </VButton>
            </VCard>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-5 content-start flex-1">
                {paginated.map((cl) => {
                  const Icon = filterIcons[cl.category] || Package;
                  const statusColor = CLAIM_STATUS_COLOR[cl.displayStatus];
                  const canShowQr = cl.displayStatus === "QR Ready";
                  return (
                    <VCard key={cl.id} className="h-full p-5 flex flex-col" style={{ borderRadius: 22, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
                      <div className="flex items-start gap-4">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}>
                          {cl.itemImageUrl ? (
                            <img src={cl.itemImageUrl} alt={cl.itemName} className="w-full h-full object-cover" />
                          ) : (
                            <Icon size={34} style={{ color: c.primary, opacity: 0.75 }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2.5">
                            <h3 className="text-base font-semibold leading-snug line-clamp-3" style={{ color: c.text }}>{cl.itemName}</h3>
                            <VBadge color={statusColor} style={{ flexShrink: 0 }}>{cl.displayStatus}</VBadge>
                          </div>
                          <div className="mt-1 space-y-1">
                            <p className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: c.textMuted }}>
                              <Icon size={13} className="shrink-0" style={{ color: c.primary }} />
                              <span className="truncate">{cl.category}</span>
                            </p>
                            <p className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: c.textMuted }}>
                              <MapPin size={13} className="shrink-0" />
                              <span className="truncate">{cl.location || "—"}</span>
                            </p>
                            <p className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: c.textMuted }}>
                              <Clock size={13} className="shrink-0" />
                              <span className="truncate">Found {fmtDay(cl.foundDate)}</span>
                              {cl.locker && (
                                <>
                                  <span className="shrink-0" style={{ color: c.textLight }}>·</span>
                                  <Package size={13} className="shrink-0" style={{ color: c.primary }} />
                                  <span className="truncate font-medium" style={{ color: c.primary }}>{cl.locker}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border p-3" style={{ backgroundColor: c.primarySoft, borderColor: "#d7e3ef" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: c.primary }}>Description</p>
                        <p className="text-[13px] leading-relaxed line-clamp-2 min-h-[42px]" style={{ color: "#475569" }}>
                          {cl.description || "No description provided."}
                        </p>
                      </div>

                      <div className="mt-auto pt-5">
                        <div className="flex items-center gap-2.5 border-t pt-4" style={{ borderColor: c.borderLight }}>
                          {canShowQr && (
                            <>
                              <VButton variant="outline" size="md" className="flex-1" onClick={() => setDetailsClaim(cl)}>
                                <Eye size={14} /> Details
                              </VButton>
                              <VButton variant="primary" size="md" className="flex-1" onClick={() => openQR(cl)} disabled={qrLoadingId === cl.id}>
                                {qrLoadingId === cl.id ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                                {qrLoadingId === cl.id ? "Preparing..." : cl.hasValidQr ? "View QR" : "Get QR Code"}
                              </VButton>
                            </>
                          )}
                          {cl.displayStatus === "Pending" && (
                            <>
                              <VButton variant="outline" size="md" className="flex-1" onClick={() => setDetailsClaim(cl)}>
                                <Eye size={14} /> Details
                              </VButton>
                              <VButton variant="danger" size="md" className="flex-1" onClick={() => setCancelTarget(cl)}>
                                <X size={14} /> Cancel
                              </VButton>
                            </>
                          )}
                          {cl.displayStatus === "Collected" && (
                            <VButton variant="outline" size="md" className="w-full" onClick={() => setDetailsClaim(cl)}>
                              <Eye size={14} /> View Details
                            </VButton>
                          )}
                          {cl.displayStatus === "Rejected" && (
                            <>
                              <VButton variant="outline" size="md" className="flex-1" onClick={() => setDetailsClaim(cl)}>
                                <Eye size={14} /> Details
                              </VButton>
                              <VButton variant="primary" size="md" className="flex-1" onClick={() => openResubmit(cl)}>
                                <RefreshCw size={14} /> Resubmit
                              </VButton>
                            </>
                          )}
                        </div>
                      </div>
                    </VCard>
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-auto pt-6">
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
                    caption={fmtTimestamp(detailsClaim.evidenceUploadedAt || detailsClaim.claimedAt)}
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

            {(detailsClaim.lostReportDescription || detailsClaim.reason) && (
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: c.fill }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>Claim reason</p>
                <p className="text-sm leading-relaxed" style={{ color: c.textMuted }}>
                  {detailsClaim.lostReportDescription || detailsClaim.reason}
                </p>
              </div>
            )}

            {(detailsClaim.displayStatus === "QR Ready" || detailsClaim.displayStatus === "Collected") && detailsClaim.adminNote && (
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "#15803d" }}>Approved reason</p>
                <p className="text-sm leading-relaxed" style={{ color: "#15803d" }}>{detailsClaim.adminNote}</p>
              </div>
            )}

            {detailsClaim.displayStatus === "Rejected" && (
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#fef2f2", border: `1px solid ${c.danger}30` }}>
                <p className="text-xs font-semibold mb-1" style={{ color: c.danger }}>Rejected reason</p>
                <p className="text-sm leading-relaxed" style={{ color: c.danger }}>
                  {detailsClaim.adminNote || "No reason was provided by the admin."}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {detailsClaim.approvedAt && detailsClaim.displayStatus !== "Rejected" && (
                <p className="text-xs mr-auto" style={{ color: c.textMuted }}>
                  Approved by admin on {fmtTimestamp(detailsClaim.approvedAt)}
                </p>
              )}
              <VButton variant="secondary" onClick={() => setDetailsClaim(null)}>Close</VButton>
              {detailsClaim.displayStatus === "Rejected" && (
                <VButton onClick={() => { const target = detailsClaim; setDetailsClaim(null); openResubmit(target); }}>
                  <RefreshCw size={14} /> Resubmit
                </VButton>
              )}
              {detailsClaim.displayStatus === "Pending" && (
                <VButton variant="danger" onClick={() => { const target = detailsClaim; setDetailsClaim(null); setCancelTarget(target); }}>
                  Cancel claim
                </VButton>
              )}
              {detailsClaim.displayStatus === "QR Ready" && (
                <VButton onClick={() => { const target = detailsClaim; setDetailsClaim(null); void openQR(target); }}>
                  <QrCode size={14} /> {detailsClaim.hasValidQr ? "View QR" : "Get QR Code"}
                </VButton>
              )}
            </div>
          </VCard>
        </div>
      )}

      {resubmitClaim && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!resubmitting) setResubmitClaim(null); }} />
          <VCard className="relative w-full max-w-lg max-h-[92vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Edit &amp; resubmit claim</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{resubmitClaim.itemName}</p>
              </div>
              <button type="button" onClick={() => { if (!resubmitting) setResubmitClaim(null); }} aria-label="Close resubmit dialog"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Claim reason</label>
            <VTextarea value={resubmitReason} onChange={(e) => setResubmitReason(e.target.value)} rows={3}
              placeholder="Describe distinctive details, proof of ownership..." />

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-semibold" style={{ color: c.text }}>Photo Evidence</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: c.textLight }}>{resubmitPhotos.length}/3</span>
                  {resubmitPhotos.length < 3 && resubmitPhotos.length > 0 && (
                    <button type="button" onClick={() => setResubmitSourceOpen(true)}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white cursor-pointer"
                      style={{ borderColor: c.border, color: c.primary }}>
                      <Camera size={13} /> Add photo
                    </button>
                  )}
                </div>
              </div>
              <input ref={resubmitInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleResubmitFiles} />
              <input ref={resubmitCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleResubmitFiles} />
              {resubmitPhotos.length === 0 ? (
                <div>
                  <PhotoPicker onUpload={() => resubmitInputRef.current?.click()} onTakePhoto={openResubmitCamera} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {resubmitPhotos.map((photo, index) => (
                    <div key={`${index}-${photo.preview.slice(-12)}`} className="relative rounded-lg overflow-hidden border" style={{ borderColor: c.border }}>
                      <img src={photo.preview} alt={`Evidence ${index + 1}`} className={`w-full object-cover ${resubmitPhotos.length === 1 ? "h-40" : "h-24"}`} />
                      <button type="button" aria-label={`Remove evidence photo ${index + 1}`}
                        onClick={() => setResubmitPhotos((prev) => prev.filter((_, i) => i !== index))}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] mt-1.5 text-center" style={{ color: c.textLight }}>JPG, PNG, HEIC · auto-compressed</p>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <VButton variant="secondary" onClick={() => { if (!resubmitting) setResubmitClaim(null); }}>Cancel</VButton>
              <VButton onClick={handleResubmit} disabled={resubmitting || !resubmitReason.trim()}>
                {resubmitting ? "Resubmitting..." : "Resubmit claim"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {resubmitSourceOpen && (
        <PhotoSourceDialog
          title="Add evidence photo"
          description="Attach another photo for your claim (up to 3)."
          onClose={() => setResubmitSourceOpen(false)}
          onTakePhoto={() => { setResubmitSourceOpen(false); openResubmitCamera(); }}
          onUpload={() => { setResubmitSourceOpen(false); resubmitInputRef.current?.click(); }}
        />
      )}

      {resubmitCameraOpen && (
        <CameraCaptureModal
          onClose={() => setResubmitCameraOpen(false)}
          onUseUpload={() => { setResubmitCameraOpen(false); resubmitInputRef.current?.click(); }}
          onCapture={(photo) => {
            setResubmitPhotos((prev) => (prev.length >= 3 ? prev : [...prev, { file: photo.file, preview: photo.preview }]));
            setResubmitCameraOpen(false);
          }}
        />
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
