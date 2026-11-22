"use client";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { claimNextStep } from "@/lib/student-workflow";
import { NO_PHOTO_REASON_MIN_LENGTH } from "@/lib/claim-validation";
import { formatDisplayDate as fmtDay, formatDisplayTime, formatDisplayTimestamp as fmtTimestamp } from "@/lib/date-format";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, FileText, Clock, QrCode, CheckCircle2,
  Monitor, Briefcase, CreditCard, Key, BookText, CupSoda, Grid3X3,
  MapPin, Camera, Timer, Lock, X, Loader2, RefreshCw, Eye,
  type LucideIcon,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StudentShell } from "@/components/student-shell";
import { useEscapeKey } from "@/lib/use-escape-key";
import { EvidenceSlider } from "@/components/evidence-slider";
import { PhotoEvidenceField, type EvidencePhoto } from "@/components/photo-evidence-field";
import { VCard, VContentPanel, VBadge, VPaginationFooter, VButton, VTextarea, VSearchInput, VFilterButton, VEmptyState, vcolors as c } from "@/components/ui/vault";
import { FilterPanel } from "@/components/filter-panel";
import { DescriptionBox } from "@/components/description-box";
import { matchesSearch } from "@/lib/search";
import {
  mapUserClaim, CLAIM_STATUS_COLOR,
  type UserClaim, type ClaimDisplayStatus,
} from "@/lib/claim-mapper";
import { clearStudentCache, getCachedClaims, setCachedClaims } from "@/lib/student-cache";

interface User { id: string; name: string; email: string; role: string; }

const filterIcons: Record<string, LucideIcon> = {
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
  const [query, setQuery] = useState("");
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
  const [resubmitNoPhoto, setResubmitNoPhoto] = useState(false);
  const [resubmitPhotos, setResubmitPhotos] = useState<EvidencePhoto[]>([]);
  const [resubmitting, setResubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pageSize = 6;

  async function loadClaims(token: string, silent = false) {
    if (!silent && !getCachedClaims()) setLoading(true);
    if (!silent) setLoadError(null);
    try {
      const res = await fetch("/api/claims", { headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" }, cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load claims");
      const mapped = ((data.data ?? []) as Record<string, unknown>[]).map(mapUserClaim);
      setClaims(mapped);
      setCachedClaims(mapped);
    } catch (e) {
      if (!silent) {
        setLoadError(e instanceof Error ? e.message : "Failed to load claims");
        if (!getCachedClaims()) setClaims([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    // Client-only mount flag; this is the standard hydration guard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = getBrowserSessionKey();
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
      setLoading(false);
      setLoadError("Session expired — please sign in again");
      return;
    }
    setUser(JSON.parse(stored));
    void loadClaims(token);
  }, []);

  // Claim decisions appear without the student refreshing the page.
  useLiveRefresh(() => {
    const token = getBrowserSessionKey();
    return token ? loadClaims(token, true) : undefined;
  }, 5000, mounted);

  function handleLogout() {
    clearStudentCache();
    clearStoredBrowserSession();
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  async function openQR(cl: UserClaim) {
    if (qrLoadingId) return;
    const token = getBrowserSessionKey();
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }
    setQrLoadingId(cl.id);
    try {
      const res = await fetch("/api/qrcode/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
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
    const token = getBrowserSessionKey();
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      setCancelTarget(null);
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/claims/${target.id}`, {
        method: "DELETE",
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to cancel claim");
        return;
      }
      clearStudentCache();
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
    setResubmitNoPhoto(false);
    setResubmitClaim(cl);
    setResubmitReason(cl.reason || "");
    setResubmitPhotos((cl.evidenceImageUrls || []).map((preview) => ({ preview, originalPreview: preview })));
  }

  async function handleResubmit() {
    if (!resubmitClaim || resubmitting) return;
    if (!resubmitReason.trim()) {
      showCenteredMessage("error", "Please describe why this item is yours");
      return;
    }
    const token = getBrowserSessionKey();
    if (!token) return;
    setResubmitting(true);
    try {
      // Evidence is stored as a data URL, so a retained photo is neither a new
      // File nor an http(s) URL. Keeping only http(s) silently dropped every
      // existing photo and the API rejected the resubmit as having none.
      const keepImages = resubmitPhotos
        .filter((photo) => !photo.file && /^(?:data:image\/|https?:)/i.test(photo.preview))
        .map((photo) => photo.preview);
      if (!resubmitPhotos.length && !resubmitNoPhoto) {
        showCenteredMessage("error", "Please keep or add at least one photo");
        return;
      }
      if (!resubmitPhotos.length && resubmitNoPhoto && resubmitReason.trim().length < NO_PHOTO_REASON_MIN_LENGTH) {
        showCenteredMessage("error", `Provide at least ${NO_PHOTO_REASON_MIN_LENGTH} characters for in-person verification`);
        return;
      }
      const form = new FormData();
      form.append("claimReason", resubmitReason.trim());
      form.append("keepImages", JSON.stringify(keepImages));
      if (resubmitNoPhoto) form.append("noPhoto", "true");
      resubmitPhotos.forEach((photo) => { if (photo.file) form.append("evidence", photo.file); });
      const res = await fetch(`/api/claims/${resubmitClaim.id}/resubmit`, {
        method: "POST",
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data.error || "Failed to resubmit claim");
      clearStudentCache();
      showCenteredMessage("success", "Claim resubmitted — awaiting verification");
      setResubmitClaim(null);
      setResubmitPhotos([]);
      await loadClaims(token);
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to resubmit claim");
    } finally {
      setResubmitting(false);
    }
  }

  useEscapeKey(!!detailsClaim, () => setDetailsClaim(null));
  useEscapeKey(!!qrModal, () => setQrModal(null));
  useEscapeKey(!!resubmitClaim, () => setResubmitClaim(null));

  if (!user || !mounted) return null;

  const filtered = claims.filter((cl) => {
    if (filter !== "All" && cl.displayStatus !== filter) return false;
    if (query.trim() && !matchesSearch(query, [
      cl.itemName,
      cl.category,
      cl.location,
      cl.reason,
      cl.displayStatus,
      cl.locker || "",
      cl.claimedAt,
    ])) return false;
    return true;
  });
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
      <main className="bg-white min-h-[calc(100vh-52px)] lg:min-h-dvh pb-28 lg:pb-6 flex flex-col">
        <div className={`px-4 sm:px-6 lg:px-12 pt-6 lg:pt-8 w-full flex flex-col ${loading || loadError || sorted.length === 0 ? "flex-1" : ""}`}>
          <FilterPanel
            search={
              <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="w-full"
                size="lg" clearable placeholder="Search claims..." />
            }
            filters={
              <>
                {filters.map((f) => {
                  const Icon = f === "All" ? Grid3X3 : f === "Pending" ? Clock : f === "QR Ready" ? QrCode : f === "Collected" ? CheckCircle2 : X;
                  const active = filter === f;
                  return (
                    <VFilterButton key={f} active={active} onClick={() => { setFilter(f); setPage(1); }}>
                      <Icon size={13} style={{ color: active ? c.primary : c.textMuted }} />
                      {f}
                    </VFilterButton>
                  );
                })}
              </>
            }
          />

          <VContentPanel>
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
                  <div className="mt-4 rounded-xl border p-3" style={{ backgroundColor: c.primarySoft, borderColor: c.borderLight }}>
                    <div className="h-3 w-24 rounded-md mb-1.5" style={{ backgroundColor: c.border }} />
                    <div className="space-y-2 min-h-[42px]">
                      <div className="h-3 w-full rounded-md" style={{ backgroundColor: c.borderLight }} />
                      <div className="h-3 w-5/6 rounded-md" style={{ backgroundColor: c.borderLight }} />
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
            <VCard className="flex-1 flex flex-col" style={{ borderRadius: 22, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <VEmptyState icon={FileText} tone="danger" role="alert" title="Could not load claims" description={loadError}
                action={<VButton variant="primary" onClick={() => { const t = getBrowserSessionKey(); if (t) void loadClaims(t); }}>
                  <RefreshCw size={14} /> Try again
                </VButton>} />
            </VCard>
          ) : sorted.length === 0 ? (
            <VCard className="flex-1 flex flex-col" style={{ borderRadius: 22, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <VEmptyState icon={FileText}
                title={claims.length === 0 ? "No claims yet" : "No claims found"}
                description={claims.length === 0
                  ? "Found something that belongs to you? Search the item inventory and submit a claim with photo evidence."
                  : `You don't have any claims with status "${filter}". Try a different filter to see your other claims.`}
                action={<VButton
                  variant={claims.length === 0 ? "primary" : "outline"}
                  onClick={() => {
                    if (claims.length === 0) {
                      router.push("/dashboard/student/search");
                    } else {
                      setFilter("All");
                      setPage(1);
                    }
                  }}>
                  {claims.length === 0 ? "Browse found items" : "Show all claims"}
                </VButton>} />
            </VCard>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-5 content-start">
                {paginated.map((cl) => {
                  const Icon = filterIcons[cl.category] || Package;
                  const statusColor = CLAIM_STATUS_COLOR[cl.displayStatus];
                  const canShowQr = cl.displayStatus === "QR Ready";
                  return (
                    <VCard key={cl.id} className="h-full p-5 flex flex-col" style={{ borderRadius: 22, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
                      <div className="flex items-start gap-4">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}>
                          {cl.itemImageUrl ? (
                            <img src={cl.itemImageUrl} alt={cl.itemName} loading="lazy" decoding="async" className="w-full h-full object-contain" />
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
                              <span className="vq-date truncate">Found {fmtDay(cl.foundDate)}</span>
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

                      <DescriptionBox className="mt-4" contentClassName="line-clamp-2 min-h-[42px]">
                        {cl.description || "No description provided."}
                      </DescriptionBox>

                      <p className="mt-3 text-xs leading-relaxed" style={{ color: c.textMuted }}>
                        {claimNextStep(cl.displayStatus)}
                      </p>
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
              <VPaginationFooter current={currentPage} total={totalPages} pageSize={pageSize} itemCount={sorted.length} onPage={setPage} />
            </>
          )}
          </VContentPanel>
        </div>
      </main>

      {/* Claim details / photo comparison */}
      {detailsClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => setDetailsClaim(null)} />
          <VCard className="relative w-full max-w-3xl max-h-[90vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Claim Details</h3>
              </div>
              <button type="button" onClick={() => setDetailsClaim(null)} aria-label="Close claim details" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer shrink-0" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>



            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Found item photo</p>
                {detailsClaim.itemImageUrls?.length ? (
                  <EvidenceSlider
                    photos={detailsClaim.itemImageUrls}
                    alt="Found item"
                    caption={`${fmtDay(detailsClaim.foundDate)}${detailsClaim.itemCreatedAt ? ` · ${formatDisplayTime(detailsClaim.itemCreatedAt)}` : ""}`}
                    label="found item"
                  />
                ) : (
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                    <div className="w-full h-64 flex items-center justify-center" style={{ backgroundColor: c.fill, color: c.textLight }}>
                      {(() => { const Icon = filterIcons[detailsClaim.category] || Package; return <Icon size={40} />; })()}
                    </div>
                    <p className="text-[11px] text-center py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>
                      <time className="vq-date">{fmtDay(detailsClaim.foundDate)}</time>
                      {detailsClaim.itemCreatedAt && ` · ${formatDisplayTime(detailsClaim.itemCreatedAt)}`}
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
              <DescriptionBox title="Claim reason" className="mb-4" contentClassName="">
                {detailsClaim.lostReportDescription || detailsClaim.reason}
              </DescriptionBox>
            )}

            {(detailsClaim.displayStatus === "QR Ready" || detailsClaim.displayStatus === "Collected") && detailsClaim.adminNote && (
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "#15803d" }}>Approved reason</p>
                <p className="text-sm leading-relaxed" style={{ color: "#15803d" }}>{detailsClaim.adminNote}</p>
              </div>
            )}

            {detailsClaim.displayStatus === "Rejected" && (
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: `color-mix(in srgb, ${c.danger} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${c.danger} 19%, transparent)` }}>
                <p className="text-xs font-semibold mb-1" style={{ color: c.danger }}>Rejected reason</p>
                <p className="text-sm leading-relaxed" style={{ color: c.danger }}>
                  {detailsClaim.adminNote || "No reason was provided by the admin."}
                </p>
              </div>
            )}

            <p className="mb-4 rounded-xl border px-3.5 py-3 text-xs leading-relaxed"
              style={{ borderColor: c.borderLight, backgroundColor: c.fill, color: c.textMuted }}>
              {claimNextStep(detailsClaim.displayStatus)}
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {detailsClaim.approvedAt && detailsClaim.displayStatus !== "Rejected" && (
                <p className="text-xs leading-relaxed" style={{ color: c.textMuted }}>
                  Approved by admin on <time className="vq-date">{fmtTimestamp(detailsClaim.approvedAt)}</time>
                </p>
              )}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
            </div>
          </VCard>
        </div>
      )}

      {resubmitClaim && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { if (!resubmitting) setResubmitClaim(null); }} />
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
              <PhotoEvidenceField
                photos={resubmitPhotos}
                onChange={(next) => { setResubmitPhotos(next); if (next.length) setResubmitNoPhoto(false); }}
                required
                label="Photo Evidence"
                emptyExtra={
                  <div>
                    {resubmitNoPhoto && (
                      <p className="rounded-xl border p-3 text-xs leading-relaxed" style={{ borderColor: c.border, color: c.textMuted }}>
                        No photo attached. Describe distinctive ownership details in at least {NO_PHOTO_REASON_MIN_LENGTH} characters. Admin must verify ownership in person.
                      </p>
                    )}
                    <label className="mt-3 flex items-start gap-2 text-xs cursor-pointer" style={{ color: c.textMuted }}>
                      <input type="checkbox" checked={resubmitNoPhoto} onChange={(event) => setResubmitNoPhoto(event.target.checked)} className="mt-0.5" />
                      I don&apos;t have a photo — request in-person verification
                    </label>
                    {resubmitNoPhoto && <p className="mt-2 text-xs" style={{ color: c.textMuted }}>{resubmitReason.trim().length}/{NO_PHOTO_REASON_MIN_LENGTH} characters</p>}
                  </div>
                }
              />
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <VButton variant="secondary" onClick={() => { if (!resubmitting) setResubmitClaim(null); }}>Cancel</VButton>
              <VButton onClick={handleResubmit} disabled={resubmitting || !resubmitReason.trim() || (!resubmitPhotos.length && (!resubmitNoPhoto || resubmitReason.trim().length < NO_PHOTO_REASON_MIN_LENGTH))}>
                {resubmitting ? "Resubmitting..." : "Resubmit claim"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {/* Locker QR */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => setQrModal(null)} />
          <VCard className="relative w-full max-w-sm p-6 text-center">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Pickup QR Code</h3>
              <button type="button" onClick={() => setQrModal(null)} aria-label="Close pickup QR" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="w-full aspect-square rounded-2xl border-2 flex items-center justify-center p-4 mb-4" style={{ borderColor: c.border, backgroundColor: c.card }}>
              {qrModal.qrDataUrl ? <img src={qrModal.qrDataUrl} alt="QR Code" className="w-full h-full object-contain" /> : <QrCode size={48} style={{ color: c.textMuted }} />}
            </div>
            <p className="text-sm font-semibold flex items-center justify-center gap-1.5" style={{ color: c.text }}>
              <Lock size={14} style={{ color: c.primary }} />
              {qrModal.locker ? `Locker ${qrModal.locker}` : "Locker pending assignment"}
            </p>
            <p className="vq-date mt-1" style={{ color: c.textMuted }}>Expires {fmtTimestamp(qrModal.expiresAt)}</p>
            <p className="text-xs mt-3 p-3 rounded-lg leading-relaxed" style={{ backgroundColor: c.primarySoft, color: c.primary }}>
              At the locker kiosk, scan your student card barcode (or show the barcode from your Profile) first, then scan this QR code to unlock the locker and collect your item.
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
