"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Package, PackageSearch, PackageCheck, FileText, Lock, Users, Search, Clock, MapPin,
  CheckCircle2, XCircle, Eye, X, Loader2, RefreshCw, Camera, Grid3X3,
  Sparkles, ChevronDown, Plus, ChevronLeft, ChevronRight,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { StudentShell } from "@/components/student-shell";
import { AdminStatusFilters, FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { DescriptionBox } from "@/components/description-box";
import { AdminListSkeleton } from "@/components/admin-list-skeleton";
import { fetchAdminData, invalidateAdminData, registerAdminCacheReset } from "@/lib/admin-data";
import { PhotoViewerModal } from "@/components/photo-viewer-modal";
import {
  VCard, VBadge, VButton, VSearchInput, VTextarea, VInput, VDropdown, VDropdownItem, VFilterButton, vcolors as c,
} from "@/components/ui/vault";
import { ITEM_CATEGORIES } from "@/lib/categories";
import { mapReport, type UserReport, type ReportStatus } from "@/lib/report-mapper";
import { suggestMatches, suggestionLabel } from "@/lib/report-match";
import { matchesSearch, dateSearchValues } from "@/lib/search";
import { useEscapeKey } from "@/lib/use-escape-key";
import { categoryIcon } from "@/lib/category-icons";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { CalendarPopover } from "@/components/date-calendar";
import { PhotoPicker } from "@/components/photo-picker";
import { PhotoSourceDialog } from "@/components/photo-source-dialog";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { compressImageFileToDataUrl } from "@/lib/image-compression";
import { CameraCaptureModal } from "@/components/camera-capture-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { clearClientSession } from "@/lib/idle-session";

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

type MatchPreview = { item: FoundItem; images: string[]; index: number };

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Intake", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

const statusOptions: Array<ReportStatus | "ALL"> = ["ALL", "PENDING", "VERIFIED", "REJECTED"];
const statusLabel: Record<string, string> = {
  ALL: "All",
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

let reportsCache: UserReport[] | null = null;
registerAdminCacheReset(() => { reportsCache = null; });

export default function AdminReports() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  const [reports, setReports] = useState<UserReport[]>(reportsCache ?? []);
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [loading, setLoading] = useState(reportsCache === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<ReportStatus | "ALL">("PENDING");
  const [query, setQuery] = useState("");

  const [matchTarget, setMatchTarget] = useState<UserReport | null>(null);
  const [matchPreview, setMatchPreview] = useState<MatchPreview | null>(null);
  const [confirmMatchItem, setConfirmMatchItem] = useState<FoundItem | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [showMatchSearch, setShowMatchSearch] = useState(false);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number; title: string } | null>(null);

  const [verifyReport, setVerifyReport] = useState<UserReport | null>(null);
  const [verifyForm, setVerifyForm] = useState({
    itemName: "", category: "", location: "", date: "", description: "",
  });
  const [verifyCategoryOpen, setVerifyCategoryOpen] = useState(false);
  const [verifyDateOpen, setVerifyDateOpen] = useState(false);
  const [verifyDateAnchor, setVerifyDateAnchor] = useState<HTMLElement | null>(null);
  const [approveStage, setApproveStage] = useState<"form" | "locker">("form");
  const [approvePhotos, setApprovePhotos] = useState<{ preview: string; originalPreview: string }[]>([]);
  const [approvePhotoSourceOpen, setApprovePhotoSourceOpen] = useState(false);
  const [approveCameraOpen, setApproveCameraOpen] = useState(false);
  const [approveEditingPhoto, setApproveEditingPhoto] = useState<number | null>(null);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const [loadingVerifyPhotos, setLoadingVerifyPhotos] = useState(false);
  const [verifyPhotosReady, setVerifyPhotosReady] = useState(false);
  const verifyOpenRef = useRef(false);
  const approveUploadRef = useRef<HTMLInputElement>(null);
  const approveCameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedLockerId, setSelectedLockerId] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [rejectReport, setRejectReport] = useState<UserReport | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [assignLockerReport, setAssignLockerReport] = useState<UserReport | null>(null);
  const [assignLockerId, setAssignLockerId] = useState("");
  const [assigningLocker, setAssigningLocker] = useState(false);

  const [busyAction, setBusyAction] = useState(false);

  function authHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function redirectUnauthorized() {
    clearClientSession();
    router.replace("/login?skip=1&expired=1");
  }

  async function fetchReports() {
    if (typeof window === "undefined" || !localStorage.getItem("token")) {
      setLoading(false);
      redirectUnauthorized();
      return;
    }
    if (!reportsCache) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchAdminData("/api/reports?light=1", localStorage.getItem("token") || "");
      if (res.status === 401) {
        redirectUnauthorized();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load reports");
      const list = (data.data as any[]).map(mapReport);
      setReports(list);
      reportsCache = list;
    } catch (e) {
      if (!reportsCache) setReports([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSupporting() {
    try {
      const [itemsRes, lockersRes] = await Promise.all([
        fetch("/api/items?status=FOUND&light=1", { headers: authHeaders(), cache: "no-store" }),
        fetch("/api/lockers?status=AVAILABLE", { headers: authHeaders(), cache: "no-store" }),
      ]);
      if (itemsRes.status === 401 || lockersRes.status === 401) {
        redirectUnauthorized();
        return;
      }
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
  }, []);

  useEffect(() => {
    if (!verifyReport) verifyOpenRef.current = false;
  }, [verifyReport]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  async function openVerify(report: UserReport) {
    verifyOpenRef.current = true;
    setVerifyReport(report);
    setApproveStage("form");
    setVerifyDateOpen(false);
    setApprovePhotos(report.images.map((src) => ({ preview: src, originalPreview: src })));
    setApprovePhotoSourceOpen(false);
    setApproveCameraOpen(false);
    setApproveEditingPhoto(null);
    setSelectedLockerId("");
    setVerifyForm({
      itemName: report.itemName,
      category: report.category,
      location: report.location,
      date: report.date,
      description: report.description,
    });
    setVerifyPhotosReady(false);
    setLoadingVerifyPhotos(true);
    if (foundItems.length === 0 || lockers.length === 0) void fetchSupporting();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setLoadingVerifyPhotos(false);
      redirectUnauthorized();
      return;
    }
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        redirectUnauthorized();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!verifyOpenRef.current) return;
      if (res.ok && data?.success && data.data) {
        const full = mapReport(data.data);
        setVerifyReport(full);
        setApprovePhotos(full.images.map((src) => ({ preview: src, originalPreview: src })));
        setVerifyPhotosReady(true);
      }
    } catch {
      // Keep the signed thumbnails; photo editing stays disabled until a reload.
    } finally {
      setLoadingVerifyPhotos(false);
    }
  }

  async function addApprovePhotos(files: File[]) {
    if (!verifyPhotosReady) return;
    if (!files.length) return;
    if (approvePhotos.length + files.length > 3) {
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
      const previews = await Promise.all(files.map((file) => compressImageFileToDataUrl(file)));
      setApprovePhotos((prev) =>
        [...prev, ...previews.map((preview) => ({ preview, originalPreview: preview }))].slice(0, 3),
      );
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Could not process one of the images");
    }
  }

  function handleApprovePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    void addApprovePhotos(files);
  }

  function openApproveCamera() {
    if (!verifyPhotosReady) return;
    setApprovePhotoSourceOpen(false);
    if (window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function") {
      setApproveCameraOpen(true);
      return;
    }
    approveCameraInputRef.current?.click();
  }

  async function saveApprovePhotos(): Promise<boolean> {
    if (!verifyReport) return false;
    if (loadingVerifyPhotos) {
      showCenteredMessage("error", "Photos are still loading — please try again");
      return false;
    }
    const next = approvePhotos.map((photo) => photo.preview);
    const current = verifyReport.images;
    if (next.length === current.length && next.every((value, index) => value === current[index])) {
      return true;
    }
    if (!verifyPhotosReady) {
      showCenteredMessage("error", "Could not load the full report photos — close and reopen the report");
      return false;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return false;
    }
    setSavingPhotos(true);
    try {
      const res = await fetch(`/api/reports/${verifyReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "update", imageUrls: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to update photos");
        return false;
      }
      const updated = mapReport(data.data);
      setReports((prev) => prev.map((report) => (report.id === updated.id ? updated : report)));
      setVerifyReport(updated);
      setApprovePhotos(updated.images.map((src) => ({ preview: src, originalPreview: src })));
      return true;
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to update photos");
      return false;
    } finally {
      setSavingPhotos(false);
    }
  }

  async function goToApproveStep() {
    if (savingPhotos || loadingVerifyPhotos) return;
    const saved = await saveApprovePhotos();
    if (!saved) return;
    if (!verifyForm.itemName.trim() || !verifyForm.location.trim()) {
      showCenteredMessage("error", "Item name and found location are required");
      return;
    }
    setApproveStage("locker");
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
      setMatchTarget(null);
      invalidateAdminData();
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
    if (!matchTarget || busyAction) return;
    setBusyAction(true);
    try {
      const res = await fetch("/api/claims/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ reportId: matchTarget.id, itemId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data.error || "Failed to match report");
      showCenteredMessage("success", "Report matched — pending claim created for review");
      setMatchTarget(null);
      invalidateAdminData();
      await fetchReports();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Failed to match report");
    } finally {
      setBusyAction(false);
    }
  }

  // Opens a read-only preview of a found item. The list photo is shown right
  // away, then the item's report photos are fetched so the slider can page
  // through everything that was handed in.
  async function openMatchPreview(item: FoundItem) {
    setMatchPreview({ item, images: item.imageUrl ? [item.imageUrl] : [], index: 0 });
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.id)}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      const fresh = data?.data;
      if (!res.ok || !data?.success || !fresh) return;
      const reportImages: string[] = Array.isArray(fresh.reports)
        ? fresh.reports.flatMap((r: any) => (Array.isArray(r.imageUrls) ? r.imageUrls : []))
        : [];
      const images = Array.from(new Set([fresh.imageUrl, ...reportImages].filter(Boolean))) as string[];
      setMatchPreview((prev) => {
        if (!prev || prev.item.id !== item.id) return prev;
        const merged = Array.from(new Set([...prev.images, ...images]));
        return { ...prev, images: merged, index: Math.min(prev.index, Math.max(0, merged.length - 1)) };
      });
    } catch {
      // Keep the list photo if the item lookup fails.
    }
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
      const body = {
        create: {
          itemName: verifyForm.itemName.trim(),
          category: verifyForm.category || null,
          location: verifyForm.location.trim(),
          date: verifyForm.date || null,
          description: verifyForm.description.trim() || null,
          lockerId: selectedLockerId || null,
        },
      };
      if (!verifyForm.itemName.trim() || !verifyForm.location.trim()) {
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
      invalidateAdminData();
      await fetchReports();
      await fetchSupporting();
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to verify report");
    } finally {
      setVerifying(false);
    }
  }

  function openAssignLocker(report: UserReport) {
    setAssignLockerReport(report);
    setAssignLockerId("");
  }

  async function handleAssignLocker() {
    const report = assignLockerReport;
    if (!report?.item || !assignLockerId) return;
    const lockerNumber = lockers.find((locker) => locker.id === assignLockerId)?.lockerNumber || "";
    setAssigningLocker(true);
    try {
      const res = await fetch(`/api/items/${report.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ lockerId: assignLockerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to assign locker");
      reportsCache = null;
      setAssignLockerReport(null);
      showCenteredMessage("success", lockerNumber ? `Locker ${lockerNumber} assigned` : "Locker assigned");
      invalidateAdminData();
      await Promise.all([fetchReports(), fetchSupporting()]);
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to assign locker");
    } finally {
      setAssigningLocker(false);
    }
  }

  useEscapeKey(!!assignLockerReport, () => { if (!assigningLocker) setAssignLockerReport(null); }, !assigningLocker);
  useEscapeKey(!!matchTarget && !viewer && !matchPreview, () => setMatchTarget(null));
  useEscapeKey(!!matchPreview && !viewer, () => setMatchPreview(null));
  useEscapeKey(approvePhotoSourceOpen, () => setApprovePhotoSourceOpen(false));
  useEscapeKey(approveStage === "locker", () => { if (!verifying) setApproveStage("form"); }, !verifying);
  useEscapeKey(!!verifyReport, () => {
    if (verifying) return;
    if (verifyDateOpen) { setVerifyDateOpen(false); return; }
    setVerifyReport(null);
  }, !verifying && approveStage !== "locker" && !approvePhotoSourceOpen && !approveCameraOpen && approveEditingPhoto === null);
  useEscapeKey(!!rejectReport, () => { if (!rejecting) setRejectReport(null); }, !rejecting);

  if (!user || !mounted) return null;


  const baseFiltered = reports.filter((report) => report.type === "FOUND" && matchesSearch(query, [
      report.itemName,
      report.description,
      report.category,
      report.location,
      report.statusLabel,
      report.typeLabel,
      report.reference,
      report.studentName,
      report.studentEmail,
      report.studentId,
      ...dateSearchValues(report.date),
      ...dateSearchValues(report.createdAt),
      report.item?.name,
      report.item?.locker,
      report.item?.locker ? `locker ${report.item.locker}` : "",
    ])
  );

  const hasFilters = Boolean(query || filterStatus !== "PENDING");

  function resetFilters() {
    setQuery("");
    setFilterStatus("PENDING");
  }

  const filtered = baseFiltered.filter((report) => filterStatus === "ALL" || report.status === filterStatus);

  const matchResults = foundItems.filter((item) =>
    matchesSearch(matchQuery, [
      item.itemName,
      item.description,
      item.foundLocation,
      item.category,
      item.locker?.lockerNumber ? `locker ${item.locker.lockerNumber}` : "",
    ])
  ).slice(0, 8);
  const suggestions =
    matchTarget && matchTarget.type === "LOST"
      ? suggestMatches(matchTarget, foundItems, { excludeItemId: matchTarget.item?.id ?? null, limit: 3 })
      : [];
  const suggestionRows = suggestions.flatMap((suggestion) => {
    const item = foundItems.find((candidate) => candidate.id === suggestion.itemId);
    return item ? [{ ...suggestion, item }] : [];
  });

  return (
    <StudentShell active="Intake" userName={user.name} userRole={user.role} pageTitle="Item Intake" bottomNav={adminNav} logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-28 lg:pb-6">
        <div className="px-4 sm:px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          <FilterPanel
            search={
              <VSearchInput value={query} onChange={setQuery} className="w-full"
                size="lg" clearable placeholder="Search item or student..." />
            }
            filters={
              <AdminStatusFilters
                options={statusOptions.map((value) => ({ value, label: statusLabel[value] }))}
                value={filterStatus}
                onChange={setFilterStatus}
              />
            }
            reset={<ResetFiltersButton disabled={!hasFilters} onClick={resetFilters} />}
          />

          {loading ? <AdminListSkeleton /> : loadError ? (
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
                {reports.length === 0
                  ? "Students have not submitted any reports yet."
                  : query
                    ? "No reports match your search."
                    : filterStatus === "PENDING"
                      ? "No reports are waiting for review."
                      : "Try another status filter."}
              </p>
            </VCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 content-start min-w-0">
              {filtered.map((report) => {
                const CategoryIcon = categoryIcon(report.category);
                return (
                <VCard key={report.id} className="p-5 min-w-0 flex flex-col transition-all duration-200 hover:shadow-lg" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                  <button type="button"
                    aria-label={report.images.length ? `View ${report.itemName} photos` : `${report.itemName} has no photos`}
                    disabled={report.images.length === 0}
                    className={`vq-admin-photo rounded-xl mb-4 relative flex items-center justify-center group ${report.images.length ? "cursor-pointer" : "cursor-default"}`}
                    style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}
                    onClick={() => {
                      if (report.images.length) {
                        setViewer({ photos: report.images, index: 0, title: report.itemName });
                      }
                    }}>
                    {report.imageUrl ? (
                      <img src={report.imageUrl} alt={report.itemName} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover bg-[#f8fafc]" />
                    ) : (
                      <>
                        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                        {report.type === "LOST"
                          ? <PackageSearch size={38} style={{ color: c.primary, opacity: 0.6 }} />
                          : <PackageCheck size={38} style={{ color: c.accent, opacity: 0.7 }} />}
                      </>
                    )}
                    {report.images.length > 0 && (
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                          <Eye size={13} /> View photos
                        </span>
                      </span>
                    )}
                    {report.images.length > 1 && (
                      <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: "rgba(15,23,42,0.65)" }}>
                        <Camera size={11} /> {report.images.length}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2 mb-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{report.itemName}</h3>
                    <VBadge color={report.color} className="ml-auto"
                      style={{ border: `1px solid color-mix(in srgb, ${report.color} 25%, transparent)` }}>
                      {statusLabel[report.status]}
                    </VBadge>
                  </div>
                  <p className="text-[11px] mb-2 flex items-center gap-1" style={{ color: c.textMuted }}>
                    <Users size={12} /> {report.studentName}
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs mb-2" style={{ color: c.textMuted }}>
                    <span className="flex items-center gap-1">
                      <CategoryIcon size={12} style={{ color: c.primary }} />
                      {report.category}
                    </span>
                    <span className="flex items-center gap-1"><MapPin size={12} /> {report.location || "—"}</span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={12} /> {fmtDay(report.date)}</span>
                      {(report.status === "VERIFIED" || report.status === "MATCHED") && (
                        report.item?.locker ? (
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Lock size={12} /> Locker <b style={{ color: c.text }}>{report.item.locker}</b>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Lock size={12} /> No locker
                            {report.item && (
                              <button type="button" onClick={() => openAssignLocker(report)}
                                className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full cursor-pointer"
                                style={{ backgroundColor: c.primarySoft, color: c.primary }}
                                title="Assign a locker" aria-label="Assign a locker">
                                <Plus size={12} />
                              </button>
                            )}
                          </span>
                        )
                      )}
                    </span>
                  </div>

                  <DescriptionBox title="Description" className="mb-3" contentClassName="line-clamp-3">
                    {report.description || "No description provided."}
                  </DescriptionBox>

                  {report.status === "PENDING" && (
                    <div className="mt-auto flex items-center gap-2 pt-4">
                      {report.type === "LOST" && (
                        <VButton variant="danger" onClick={() => { setRejectReport(report); setRejectNote(""); }}>
                          <XCircle size={14} /> Reject
                        </VButton>
                      )}
                      {report.type === "FOUND" ? (
                        <VButton className="flex-1" onClick={() => void openVerify(report)}>
                          <CheckCircle2 size={14} /> Verify
                        </VButton>
                      ) : (
                        <VButton className="flex-1" onClick={() => { setMatchTarget(report); setMatchQuery(""); setShowMatchSearch(false); if (foundItems.length === 0) void fetchSupporting(); }}>
                          <Search size={14} /> Match
                        </VButton>
                      )}
                    </div>
                  )}
                </VCard>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Match modal (lost reports) */}
      {matchTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMatchTarget(null)} />
          <VCard className="relative w-full max-w-2xl max-h-[90vh] overflow-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Match a found item</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{matchTarget.itemName} · {matchTarget.studentName}</p>
              </div>
              <button type="button" onClick={() => setMatchTarget(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: c.textMuted }}>
              The student is notified and can submit a claim with evidence.
            </p>

            {!showMatchSearch && suggestionRows.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold flex items-center gap-1.5 mb-2" style={{ color: c.text }}>
                  <Sparkles size={13} style={{ color: c.primary }} /> Suggested matches
                </p>
                <div className="space-y-2">
                  {suggestionRows.map(({ item, score }) => {
                    const chip =
                      score >= 70
                        ? { backgroundColor: "#dcfce7", color: "#15803d" }
                        : score >= 50
                          ? { backgroundColor: "#dbeafe", color: "#1d4ed8" }
                          : { backgroundColor: c.fill, color: c.textMuted };
                    return (
                      <div key={`suggest-${item.id}`} className="flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer hover:bg-[#f8fafc] transition-colors duration-150"
                        style={{ borderColor: c.borderLight, backgroundColor: c.card }}
                        onClick={() => void openMatchPreview(item)}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.itemName} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.fill }}>
                            <Package size={16} style={{ color: c.primary }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{item.itemName}</p>
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={chip}>
                              {suggestionLabel(score)} {score}
                            </span>
                          </div>
                          <p className="text-[11px] truncate" style={{ color: c.textMuted }}>
                            {item.category || "Others"} · {fmtDay(item.foundDate)}{item.foundLocation ? ` · ${item.foundLocation}` : ""}{item.locker ? ` · Locker ${item.locker.lockerNumber}` : ""}
                          </p>
                        </div>
                        <VButton variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); void openMatchPreview(item); }}>
                          View
                        </VButton>
                        <VButton size="sm" disabled={busyAction} onClick={(e) => { e.stopPropagation(); setConfirmMatchItem(item); }}>
                          Match
                        </VButton>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {suggestionRows.length > 0 && !showMatchSearch ? (
              <button type="button"
                className="text-[11px] font-semibold underline hover:opacity-70 cursor-pointer"
                style={{ color: c.primary }}
                onClick={() => { setShowMatchSearch(true); setMatchQuery(""); }}>
                Search all found items
              </button>
            ) : (
              <>
                <VSearchInput value={matchQuery} onChange={setMatchQuery} placeholder="Search found items..." className="mb-3" />
                <div className="space-y-2 max-h-56 overflow-auto">
                  {matchResults.length === 0 ? (
                    <p className="text-xs py-3 text-center" style={{ color: c.textLight }}>No found items match your search.</p>
                  ) : matchResults.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer hover:bg-[#f8fafc] transition-colors duration-150" style={{ borderColor: c.borderLight }}
                      onClick={() => void openMatchPreview(item)}>
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
                          {item.category || "Others"} · {item.foundLocation || "—"} · {fmtDay(item.foundDate)}{item.locker ? ` · Locker ${item.locker.lockerNumber}` : ""}
                        </p>
                      </div>
                      <VButton variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); void openMatchPreview(item); }}>
                        View
                      </VButton>
                      <VButton size="sm" disabled={busyAction} onClick={(e) => { e.stopPropagation(); setConfirmMatchItem(item); }}>
                        Match
                      </VButton>
                    </div>
                  ))}
                </div>
              </>
            )}

          </VCard>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmMatchItem}
        title="Match this item?"
        tone="primary"
        confirmLabel="Match"
        onCancel={() => setConfirmMatchItem(null)}
        onConfirm={() => {
          const item = confirmMatchItem;
          setConfirmMatchItem(null);
          if (item) void handleMatch(item.id);
        }}
      />

      {matchPreview && (
        <ItemDetailsModal
          zIndex="z-[70]"
          title={matchPreview.item.itemName}
          statusLabel="Found"
          statusColor={c.primary}
          category={matchPreview.item.category || "Others"}
          location={matchPreview.item.foundLocation}
          date={fmtDay(matchPreview.item.foundDate)}
          description={matchPreview.item.description}
          photos={matchPreview.images}
          photoIndex={matchPreview.index}
          onPhotoIndexChange={(index) => setMatchPreview((prev) => (prev ? { ...prev, index } : prev))}
          onViewPhoto={() => setViewer({ photos: matchPreview.images, index: matchPreview.index, title: matchPreview.item.itemName })}
          onClose={() => setMatchPreview(null)}
          footer={<VButton variant="secondary" className="flex-1" onClick={() => setMatchPreview(null)}>Close</VButton>}
        />
      )}

      {viewer && (
        <PhotoViewerModal
          photos={viewer.photos}
          index={viewer.index}
          title={viewer.title}
          onIndexChange={(index) => setViewer((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setViewer(null)}
        />
      )}

      {/* Verify modal */}
      {verifyReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!verifying) setVerifyReport(null); }} />
          <VCard className="relative w-full max-w-2xl max-h-[92vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Approve found report</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{verifyReport.itemName} · {verifyReport.studentName}</p>
              </div>
              <button type="button" onClick={() => { if (!verifying) setVerifyReport(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                    Item name <span style={{ color: c.danger }}>*</span>
                  </label>
                  <VInput value={verifyForm.itemName} maxLength={100}
                    onChange={(e) => setVerifyForm({ ...verifyForm, itemName: e.target.value })}
                    placeholder="e.g. Black Adidas backpack" />
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                      Category <span style={{ color: c.danger }}>*</span>
                    </label>
                    <VDropdown open={verifyCategoryOpen} onOpenChange={setVerifyCategoryOpen} width="w-full"
                      trigger={
                        <button type="button" onClick={() => setVerifyCategoryOpen(!verifyCategoryOpen)}
                          className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm font-medium border bg-white text-left cursor-pointer relative"
                          style={{ borderColor: c.border, color: verifyForm.category ? c.text : c.textMuted }}>
                          {(() => { const Icon = categoryIcon(verifyForm.category); return verifyForm.category ? <Icon size={15} style={{ color: c.primary }} /> : null; })()}
                          <span>{verifyForm.category || "Select a category"}</span>
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs" style={{ color: c.textMuted }}>▾</span>
                        </button>
                      }>
                      {(close) => (
                        <>
                          {ITEM_CATEGORIES.map((cat) => {
                            const Icon = categoryIcon(cat);
                            return (
                              <VDropdownItem key={cat} active={verifyForm.category === cat}
                                onSelect={() => { setVerifyForm({ ...verifyForm, category: cat }); close(); }}>
                                <Icon size={15} style={{ color: c.primary }} /> {cat}
                              </VDropdownItem>
                            );
                          })}
                        </>
                      )}
                    </VDropdown>
                  </div>

                  <div className="relative">
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                      Found date <span style={{ color: c.danger }}>*</span>
                    </label>
                    <VFilterButton className="w-full justify-between" style={{ height: 44, fontWeight: 400, color: verifyForm.date ? c.text : c.textMuted, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                      onClick={(e) => { setVerifyDateAnchor(e.currentTarget); setVerifyDateOpen((open) => !open); }}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Clock size={14} style={{ color: c.primary }} />
                        <span className="truncate">{verifyForm.date ? fmtDay(verifyForm.date) : "Select date"}</span>
                      </span>
                      <ChevronDown size={13} style={{ color: c.textMuted }} />
                    </VFilterButton>

                    {verifyDateOpen && (
                      <CalendarPopover anchor={verifyDateAnchor} compact value={verifyForm.date}
                        onChange={(iso) => setVerifyForm((prev) => ({ ...prev, date: iso }))}
                        onClose={() => setVerifyDateOpen(false)} />
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                    Found location <span style={{ color: c.danger }}>*</span>
                  </label>
                  <VInput value={verifyForm.location} maxLength={200}
                    onChange={(e) => setVerifyForm({ ...verifyForm, location: e.target.value })}
                    placeholder="e.g. Library 3rd Floor" />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Description</label>
                  <VTextarea rows={3} value={verifyForm.description} maxLength={2000}
                    onChange={(e) => setVerifyForm({ ...verifyForm, description: e.target.value })}
                    placeholder="Provide details like color, brand and distinguishing features..." />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="text-sm font-medium" style={{ color: c.text }}>
                      Photo Evidence <span className="font-normal" style={{ color: c.textLight }}>(optional)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]" style={{ color: c.textLight }}>{approvePhotos.length}/3</span>
                      {verifyPhotosReady && approvePhotos.length > 0 && approvePhotos.length < 3 && (
                        <button type="button" onClick={() => setApprovePhotoSourceOpen(true)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white cursor-pointer"
                          style={{ borderColor: c.border, color: c.primary }}>
                          <Plus size={13} /> Add photo
                        </button>
                      )}
                    </div>
                  </div>
                  <input ref={approveUploadRef} type="file" accept="image/*" multiple className="hidden" onChange={handleApprovePhotoChange} />
                  <input ref={approveCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleApprovePhotoChange} />

                  {!verifyPhotosReady ? (
                    <div className="rounded-xl border px-4 py-5 text-center text-xs" style={{ borderColor: c.border, backgroundColor: c.fill, color: c.textMuted }}>
                      {loadingVerifyPhotos ? (
                        <span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Loading full photos…</span>
                      ) : (
                        "Photo editing is unavailable. You can still approve or reject this report."
                      )}
                    </div>
                  ) : approvePhotos.length === 0 ? (
                    <div>
                      <PhotoPicker
                        onUpload={() => approveUploadRef.current?.click()}
                        onTakePhoto={openApproveCamera}
                      />
                    </div>
                  ) : (
                    <div className={`grid gap-2 ${approvePhotos.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
                      {approvePhotos.map((photo, index) => (
                        <div key={`approve-photo-${index}`} className="relative rounded-xl overflow-hidden border group" style={{ borderColor: c.border }}>
                          <button type="button" aria-label={`View or crop photo ${index + 1}`}
                            className="block w-full cursor-pointer"
                            onClick={() => setApproveEditingPhoto(index)}>
                            <img src={photo.preview} alt={`Report photo ${index + 1}`}
                              className={`w-full object-cover bg-[#f8fafc] ${approvePhotos.length === 1 ? "h-32" : "h-20"}`} />
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                                View &amp; crop
                              </span>
                            </span>
                          </button>
                          {photo.preview !== photo.originalPreview && (
                            <button type="button" aria-label={`Revert photo ${index + 1} to original`}
                              className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/60 text-white text-[9px] font-semibold hover:bg-black/80 cursor-pointer"
                              onClick={() => setApprovePhotos((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, preview: item.originalPreview } : item)),
                              )}>
                              Revert
                            </button>
                          )}
                          <button type="button" aria-label={`Remove photo ${index + 1}`}
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
                            onClick={() => setApprovePhotos((prev) => prev.filter((_, i) => i !== index))}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] mt-1.5 text-center" style={{ color: c.textLight }}>JPG, PNG, HEIC · auto-compressed</p>
                </div>
                <p className="text-[11px]" style={{ color: c.textLight }}>
                  Only approve after the item has been physically handed in. The item will appear in Search immediately.
                </p>
              </div>


            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t" style={{ borderColor: c.borderLight }}>
              <VButton variant="secondary" onClick={() => { if (!verifying) setVerifyReport(null); }}>Cancel</VButton>
              <VButton variant="danger" disabled={verifying || savingPhotos}
                onClick={() => { setRejectReport(verifyReport); setRejectNote(""); setVerifyReport(null); }}>
                <XCircle size={14} /> Reject
              </VButton>
              <VButton onClick={() => void goToApproveStep()} disabled={verifying || savingPhotos || loadingVerifyPhotos}>
                {savingPhotos || loadingVerifyPhotos ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {loadingVerifyPhotos ? "Loading..." : savingPhotos ? "Saving..." : "Approve"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {approvePhotoSourceOpen && (
        <PhotoSourceDialog
          onClose={() => setApprovePhotoSourceOpen(false)}
          onTakePhoto={openApproveCamera}
          onUpload={() => { setApprovePhotoSourceOpen(false); approveUploadRef.current?.click(); }}
        />
      )}

      {approveCameraOpen && (
        <CameraCaptureModal
          onClose={() => setApproveCameraOpen(false)}
          onUseUpload={() => { setApproveCameraOpen(false); approveUploadRef.current?.click(); }}
          onCapture={(photo) => {
            setApprovePhotos((prev) =>
              prev.length >= 3 ? prev : [...prev, { preview: photo.preview, originalPreview: photo.preview }],
            );
            setApproveCameraOpen(false);
          }}
        />
      )}

      {approveEditingPhoto !== null && approvePhotos[approveEditingPhoto] && (
        <PhotoCropModal
          src={approvePhotos[approveEditingPhoto].preview}
          onClose={() => setApproveEditingPhoto(null)}
          onSave={(photo) => {
            setApprovePhotos((prev) =>
              prev.map((item, index) => (index === approveEditingPhoto ? { ...item, preview: photo.preview } : item)),
            );
            setApproveEditingPhoto(null);
          }}
        />
      )}

      {verifyReport && approveStage === "locker" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!verifying) setApproveStage("form"); }} />
          <VCard className="relative w-full max-w-lg max-h-[92vh] overflow-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Assign a locker</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{verifyReport.itemName} · {verifyReport.studentName}</p>
              </div>
              <button type="button" onClick={() => { if (!verifying) setApproveStage("form"); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: c.textMuted }}>
              Choose an available locker to store the item.
            </p>

            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto pr-1">
              <button type="button"
                className="rounded-xl border border-dashed p-3 flex flex-col items-center gap-1.5 cursor-pointer"
                style={{
                  borderColor: selectedLockerId === "" ? c.primary : c.border,
                  backgroundColor: selectedLockerId === "" ? c.primarySoft : "#fff",
                  color: c.textMuted,
                }}
                onClick={() => setSelectedLockerId("")}>
                <div className="w-full h-14 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.fill }}>
                  <Package size={22} style={{ color: c.textMuted }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: c.text }}>No locker</span>
                <span className="text-[10px]">Store later</span>
              </button>
              {lockers.map((locker) => {
                const selected = selectedLockerId === locker.id;
                return (
                  <button key={locker.id} type="button"
                    className="rounded-xl border p-3 flex flex-col items-center gap-1.5 cursor-pointer transition-colors duration-150"
                    style={{
                      borderColor: selected ? c.primary : c.borderLight,
                      backgroundColor: selected ? c.primarySoft : "#fff",
                    }}
                    onClick={() => setSelectedLockerId(locker.id)}>
                    <div className="w-full h-14 rounded-lg flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}>
                      {selected
                        ? <CheckCircle2 size={22} style={{ color: c.primary }} />
                        : <Lock size={22} style={{ color: c.textMuted }} />}
                    </div>
                    <span className="text-xs font-bold" style={{ color: c.text }}>{locker.lockerNumber}</span>
                    <span className="text-[10px]" style={{ color: c.textMuted }}>Available</span>
                  </button>
                );
              })}
            </div>

            {lockers.length === 0 && (
              <p className="text-[11px] mt-3 text-center" style={{ color: c.textLight }}>
                No lockers are currently available. You can approve without a locker.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t" style={{ borderColor: c.borderLight }}>
              <VButton variant="secondary" disabled={verifying} onClick={() => setApproveStage("form")}>Back</VButton>
              <VButton onClick={handleVerify} disabled={verifying}>
                {verifying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {verifying ? "Approving..." : "Approve"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {assignLockerReport && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!assigningLocker) setAssignLockerReport(null); }} />
          <VCard className="relative w-full max-w-lg max-h-[92vh] overflow-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Assign a locker</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{assignLockerReport.item?.name || assignLockerReport.itemName}</p>
              </div>
              <button type="button" onClick={() => { if (!assigningLocker) setAssignLockerReport(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: c.textMuted }}>
              Choose an available locker to store the item.
            </p>

            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto pr-1">
              {lockers.map((locker) => {
                const selected = assignLockerId === locker.id;
                return (
                  <button key={locker.id} type="button"
                    className="rounded-xl border p-3 flex flex-col items-center gap-1.5 cursor-pointer transition-colors duration-150"
                    style={{
                      borderColor: selected ? c.primary : c.borderLight,
                      backgroundColor: selected ? c.primarySoft : "#fff",
                    }}
                    onClick={() => setAssignLockerId(locker.id)}>
                    <div className="w-full h-14 rounded-lg flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}>
                      {selected
                        ? <CheckCircle2 size={22} style={{ color: c.primary }} />
                        : <Lock size={22} style={{ color: c.textMuted }} />}
                    </div>
                    <span className="text-xs font-bold" style={{ color: c.text }}>{locker.lockerNumber}</span>
                    <span className="text-[10px]" style={{ color: c.textMuted }}>Available</span>
                  </button>
                );
              })}
            </div>

            {lockers.length === 0 && (
              <p className="text-[11px] mt-3 text-center" style={{ color: c.textLight }}>
                No lockers are currently available.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t" style={{ borderColor: c.borderLight }}>
              <VButton variant="secondary" disabled={assigningLocker} onClick={() => setAssignLockerReport(null)}>Cancel</VButton>
              <VButton onClick={handleAssignLocker} disabled={assigningLocker || !assignLockerId}>
                <CheckCircle2 size={14} />
                {assigningLocker ? "Assigning..." : "Assign"}
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
