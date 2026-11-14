"use client";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { formatDisplayDate as fmtDay, formatDisplayDate as fmtItemDate } from "@/lib/date-format";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Package,
  Briefcase, CreditCard, Key, BookText, CupSoda,
  ChevronDown, Monitor, Grid3X3, ArrowUpDown,
  MapPin, Clock, ChevronLeft, ChevronRight, X, Upload, Eye, Crop, FileText,
  RefreshCw, CheckCircle2, Plus, RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { StudentShell } from "@/components/student-shell";
import { FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { FloatingPanel } from "@/components/date-calendar";
import { PhotoPicker } from "@/components/photo-picker";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { CameraCaptureModal } from "@/components/camera-capture-modal";
import { PhotoSourceDialog } from "@/components/photo-source-dialog";
import {
  VCard, VContentPanel, VBadge, VFilterButton, VPaginationFooter, VDropdown, VDropdownItem, VSearchInput, VButton, VTextarea,
  vcolors as c,
} from "@/components/ui/vault";
import { mapApiItem, type FoundItem } from "@/lib/item-mapper";
import { compressImageFile } from "@/lib/image-compression";
import { clearStudentCache, getCachedClaimedIds, getCachedSearchItems, setCachedSearchItems } from "@/lib/student-cache";
import { useEscapeKey } from "@/lib/use-escape-key";
import { matchesSearch, dateSearchValues } from "@/lib/search";
import { uniquePhotos } from "@/lib/photo-gallery";
import { lostReportClaimReason } from "@/lib/lost-report-claim";
import { fetchReportPages } from "@/lib/report-pages";
import { NO_PHOTO_REASON_HELP, NO_PHOTO_REASON_MIN_LENGTH } from "@/lib/claim-validation";

interface User { id: string; name: string; email: string; role: string; }

const categories = [
  { label: "Electronics", icon: Monitor, color: "#355C8A" },
  { label: "Bags", icon: Briefcase, color: "#29486A" },
  { label: "Student Cards", icon: CreditCard, color: "#7FB8B5" },
  { label: "Keys", icon: Key, color: "#355C8A" },
  { label: "Documents", icon: BookText, color: "#29486A" },
  { label: "Water Bottles", icon: CupSoda, color: "#7FB8B5" },
  { label: "Others", icon: Grid3X3, color: "#355C8A" },
];

const filterIcons: Record<string, LucideIcon> = {
  Electronics: Monitor,
  Bags: Briefcase,
  "Student Cards": CreditCard,
  Keys: Key,
  Documents: BookText,
  "Water Bottles": CupSoda,
  Others: Grid3X3,
};

type LostReportOption = {
  id: string;
  itemName: string;
  category: string;
  date: string;
  description: string;
  location: string;
  images: string[];
};

export default function StudentSearch() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  const [items, setItems] = useState<FoundItem[]>(() => getCachedSearchItems() ?? []);
  const [loading, setLoading] = useState(() => getCachedSearchItems() === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimedItemIds, setClaimedItemIds] = useState<Set<string>>(() => getCachedClaimedIds() ?? new Set());

  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [calOffset, setCalOffset] = useState(0);
  const [tempFrom, setTempFrom] = useState("");
  const [tempTo, setTempTo] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [viewItem, setViewItem] = useState<FoundItem | null>(null);

  // Claim modal state
  const [claimItem, setClaimItem] = useState<FoundItem | null>(null);
  const [claimReason, setClaimReason] = useState("");
  const [claimPhotos, setClaimPhotos] = useState<{ file: File; preview: string; originalFile: File; originalPreview: string }[]>([]);
  const [claimCameraOpen, setClaimCameraOpen] = useState(false);
  const [claimPhotoSourceOpen, setClaimPhotoSourceOpen] = useState(false);
  const [claimEditPhoto, setClaimEditPhoto] = useState<number | null>(null);
  const claimCameraRef = useRef<HTMLInputElement>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimReportId, setClaimReportId] = useState<string | null>(null);
  const [claimPrefilling, setClaimPrefilling] = useState(false);
  const [claimNoPhoto, setClaimNoPhoto] = useState(false);
  const claimPrefillRequest = useRef(0);

  // Lost reports are offered explicitly before opening the claim form.
  const [lostReports, setLostReports] = useState<LostReportOption[]>([]);
  const [lostReportsLoaded, setLostReportsLoaded] = useState(false);
  const [linkPromptItem, setLinkPromptItem] = useState<FoundItem | null>(null);
  const [linkChoice, setLinkChoice] = useState<string | null>(null);
  const [linkSkipConfirmed, setLinkSkipConfirmed] = useState(false);
  const [lostReportPreview, setLostReportPreview] = useState<{ report: LostReportOption; index: number } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef(false);

  function openLostReportPreview(report: LostReportOption) {
    setLostReportPreview({ report, index: 0 });
  }

  async function loadLostReports(token: string): Promise<LostReportOption[]> {
    try {
      const res = await fetchReportPages("/api/reports?type=LOST&status=PENDING", token);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !Array.isArray(data.data)) return [];
      const list: LostReportOption[] = (data.data as Record<string, unknown>[])
        .filter((report) => report.type === "LOST" && report.status === "PENDING")
        .map((report) => ({
          id: String(report.id),
          itemName: typeof report.itemName === "string" ? report.itemName : "Untitled report",
          category: typeof report.category === "string" ? report.category : "Others",
          date: String(report.date || report.createdAt || "").slice(0, 10),
          description: typeof report.description === "string" ? report.description : "",
          location: typeof report.location === "string" ? report.location : "",
          images: uniquePhotos(Array.isArray(report.imageUrls) && report.imageUrls.length
            ? report.imageUrls
            : report.imageUrl
              ? [report.imageUrl]
              : []),
        }));
      setLostReports(list);
      return list;
    } catch {
      return [];
    } finally {
      setLostReportsLoaded(true);
    }
  }

  async function loadData(token: string) {
    if (!getCachedSearchItems()) setLoading(true);
    setLoadError(null);
    try {
      const [itemsRes, claimsRes] = await Promise.all([
        fetch("/api/items?light=1", { headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" }, cache: "no-store" }),
        fetch("/api/claims", { headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" }, cache: "no-store" }),
      ]);
      const itemsJson = await itemsRes.json().catch(() => null);
      if (!itemsRes.ok || !itemsJson?.success) {
        throw new Error(itemsJson?.error || "Failed to load items");
      }
      const mapped = ((itemsJson.data ?? []) as Record<string, unknown>[]).map(mapApiItem);

      const claimsJson = claimsRes.ok ? await claimsRes.json().catch(() => null) : null;
      const claimedIds = claimsJson?.success && Array.isArray(claimsJson.data)
        ? (claimsJson.data as Record<string, unknown>[])
          .map((cl) => (typeof cl.itemId === "string" ? cl.itemId : ""))
          .filter(Boolean)
        : [];
      const claimedSet = new Set(claimedIds);

      // Apply everything together so claimed items never flash into view.
      setClaimedItemIds(claimedSet);

      setItems(mapped);
      setCachedSearchItems(mapped, claimedSet);

      // A match notification deep-links to /search?item=<id>. A suggestion
      // from a lost report also includes report=<id> so the claim form opens
      // with that report already linked.
      if (!deepLinkHandled.current) {
        deepLinkHandled.current = true;
        const params = new URLSearchParams(window.location.search);
        const targetId = params.get("item");
        const targetReportId = params.get("report");
        const targetName = params.get("claim");
        const targetView = params.get("view");
        if (targetId) {
          window.history.replaceState(null, "", "/dashboard/student/search");
          const target = mapped.find((item) => item.id === targetId);
          if (target && !claimedSet.has(target.id)) {
            if (targetReportId) {
              const reports = lostReportsLoaded ? lostReports : await loadLostReports(token);
              void startClaim(target, targetReportId, reports);
            } else {
              setViewItem(target);
            }
          } else {
            showCenteredMessage("error", "That item is no longer available");
          }
        } else if (targetName) {
          window.history.replaceState(null, "", "/dashboard/student/search");
          const target = mapped.find(
            (item) => item.name.trim().toLowerCase() === targetName.trim().toLowerCase(),
          );
          if (target && !claimedSet.has(target.id) && target.status === "FOUND" && !target.reportedByMe) {
            startClaim(target, null);
          } else {
            showCenteredMessage("error", "That item is no longer available");
          }
        } else if (targetView) {
          window.history.replaceState(null, "", "/dashboard/student/search");
          const target = mapped.find(
            (item) => item.name.trim().toLowerCase() === targetView.trim().toLowerCase(),
          );
          if (target) {
            setViewItem(target);
          } else {
            showCenteredMessage("error", "That item is no longer available");
          }
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load items");
      if (!getCachedSearchItems()) setItems([]);
    } finally {
      setLoading(false);
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
    void loadData(token);
    void loadLostReports(token);
  }, []);

  function handleLogout() {
    clearStudentCache();
    clearStoredBrowserSession();
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  const filtered = items
    .filter((item) => {
      // Items this student handed in or already claimed (pending, approved or
      // rejected) never appear in their own search results.
      if (item.reportedByMe) return false;
      if (claimedItemIds.has(item.id)) return false;
      if (!matchesSearch(query, [item.name, item.description, item.category, item.location, item.statusLabel, item.locker, item.locker ? `locker ${item.locker}` : "", ...dateSearchValues(item.date)])) return false;
      if (selectedCategory && item.category !== selectedCategory) return false;
      if (dateFrom && dateTo) {
        if (item.date < dateFrom) return false;
        if (item.date > dateTo) return false;
      }
      return true;
    })
    .sort((a, b) => (sortOrder === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function parseDate(d: string) {
    return new Date(d + "T00:00:00");
  }

  // Both endpoints use the same complete date format as item cards.
  function fmtRange(from: string, to: string) {
    const start = parseDate(from);
    const end = parseDate(to);
    return `${fmtDay(start)} - ${fmtDay(end)}`;
  }


  function toISO(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function monthGrid(year: number, month: number) {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = first.getDay();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }

  const today = new Date();
  const todayIso = toISO(today);
  const baseMonth = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
  const months = [baseMonth, new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1)];

  function monthOffsetFor(iso: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 0;
    const d = new Date(`${iso}T00:00:00`);
    return (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
  }

  function closeDateCalendar() {
    setDateRangeOpen(false);
    setCalOffset(0);
  }

  function openDateCalendar() {
    setTempFrom(dateFrom);
    setTempTo(dateTo);
    // Reopen on the month of the applied date, or the current month if empty.
    setCalOffset(dateFrom ? monthOffsetFor(dateFrom) : 0);
    setDateRangeOpen(true);
  }

  function isInRange(d: Date) {
    if (!tempFrom || !tempTo) return false;
    return d > parseDate(tempFrom) && d < parseDate(tempTo);
  }

  async function openClaim(item: FoundItem) {
    if (item.reportedByMe) {
      showCenteredMessage("error", "You cannot claim an item you reported as found");
      return;
    }
    if (item.status !== "FOUND") {
      showCenteredMessage("error", "This item is no longer available for claim");
      return;
    }
    if (claimedItemIds.has(item.id)) {
      showCenteredMessage("error", "You already have a claim for this item");
      return;
    }
    setViewItem(null);

    // Always ask which lost report to link when the student has any pending.
    let reports = lostReports;
    const token = getBrowserSessionKey();
    if (!lostReportsLoaded && token) reports = await loadLostReports(token);

    if (reports.length > 0) {
      setLinkPromptItem(item);
      setLinkChoice(null);
      setLinkSkipConfirmed(false);
      return;
    }
    startClaim(item, null);
  }

  function closeClaim() {
    claimPrefillRequest.current++;
    setClaimPrefilling(false);
    setClaimItem(null);
    setClaimNoPhoto(false);
    setLinkSkipConfirmed(false);
  }

  async function startClaim(item: FoundItem, reportId: string | null, reports = lostReports) {
    if (item.reportedByMe || item.status !== "FOUND") {
      showCenteredMessage("error", "This item is not available for you to claim");
      return;
    }
    const linked = reportId ? reports.find((report) => report.id === reportId) : null;
    if (reportId && !linked) {
      showCenteredMessage("error", "That lost report is no longer pending. Select another report or claim without linking.");
      setViewItem(item);
      return;
    }
    const request = ++claimPrefillRequest.current;
    setClaimItem(item);
    setClaimReportId(reportId);
    setClaimNoPhoto(false);
    setLinkSkipConfirmed(false);
    setClaimReason(linked ? lostReportClaimReason(linked) : "");
    setClaimPhotos([]);
    setClaimCameraOpen(false);
    setClaimPhotoSourceOpen(false);
    setClaimEditPhoto(null);
    setClaimPrefilling(!!linked?.images.length);
    if (!linked?.images.length) return;
    try {
      const drafts = await Promise.all(uniquePhotos(linked.images).slice(0, 3).map(async (source, index) => {
        const response = await fetch(source);
        if (!response.ok) throw new Error("Could not load report photo");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("Invalid report photo");
        const file = new File([blob], `lost-report-${index + 1}`, { type: blob.type });
        const compressed = await compressImageFile(file);
        return { file: compressed.file, preview: compressed.preview, originalFile: compressed.file, originalPreview: compressed.preview };
      }));
      if (request === claimPrefillRequest.current) setClaimPhotos(drafts);
    } catch {
      if (request === claimPrefillRequest.current) showCenteredMessage("error", "Could not load your report photos. Please upload evidence before submitting.");
    } finally {
      if (request === claimPrefillRequest.current) setClaimPrefilling(false);
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (claimPhotos.length + files.length > 3) {
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
          return {
            file: compressed.file,
            preview: compressed.preview,
            originalFile: compressed.file,
            originalPreview: compressed.preview,
          };
        }),
      );
      setClaimPhotos((prev) => [...prev, ...drafts].slice(0, 3));
      setClaimNoPhoto(false);
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Could not process one of the images");
    }
  }

  function openClaimCamera() {
    if (window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function") {
      setClaimCameraOpen(true);
      return;
    }
    claimCameraRef.current?.click();
  }

  async function handleSubmitClaim() {
    if (!claimItem || claimPrefilling || claimSubmitting) return;
    const reason = claimReason.trim();
    if (!reason) {
      showCenteredMessage("error", "Please describe why this item is yours");
      return;
    }
    if (!claimNoPhoto && !claimPhotos.length) {
      showCenteredMessage("error", "Please upload photo evidence");
      return;
    }
    if (claimNoPhoto && reason.length < NO_PHOTO_REASON_MIN_LENGTH) {
      showCenteredMessage("error", `${NO_PHOTO_REASON_HELP} At least ${NO_PHOTO_REASON_MIN_LENGTH} characters are required.`);
      return;
    }

    const token = getBrowserSessionKey();
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }

    const item = claimItem;
    setClaimSubmitting(true);
    try {
      const form = new FormData();
      form.append("itemId", item.id);
      form.append("claimReason", reason);
      if (claimReportId) form.append("reportId", claimReportId);
      if (claimNoPhoto) {
        form.append("noPhoto", "true");
      } else {
        claimPhotos.forEach((photo) => form.append("evidence", photo.file));
      }

      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to submit claim");
        return;
      }

      clearStudentCache();
      setClaimedItemIds((prev) => new Set(prev).add(item.id));
      if (claimReportId) {
        setLostReports((prev) => prev.filter((report) => report.id !== claimReportId));
      }
      setClaimItem(null);
      setClaimReportId(null);
      setClaimReason("");
      setClaimPhotos([]);
      setClaimNoPhoto(false);
      setClaimCameraOpen(false);
      setClaimPhotoSourceOpen(false);
      setClaimEditPhoto(null);
      if (fileRef.current) fileRef.current.value = "";
      if (claimCameraRef.current) claimCameraRef.current.value = "";
      showCenteredMessage("success", claimNoPhoto
        ? "Claim submitted for in-person verification — awaiting review"
        : "Claim submitted with evidence — awaiting verification");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to submit claim");
    } finally {
      setClaimSubmitting(false);
    }
  }

  useEscapeKey(!!lostReportPreview, () => setLostReportPreview(null));
  useEscapeKey(!!viewItem, () => setViewItem(null));
  useEscapeKey(!!linkPromptItem, () => { setLinkPromptItem(null); setLinkSkipConfirmed(false); });
  useEscapeKey(!!claimItem && !claimCameraOpen && !claimPhotoSourceOpen && claimEditPhoto === null, closeClaim);

  if (!user || !mounted) return null;

  const hasFilters = !!(query || selectedCategory || dateFrom || dateTo || sortOrder !== "newest");

  function resetFilters() {
    setQuery("");
    setSelectedCategory(null);
    setDateFrom("");
    setDateTo("");
    setSortOrder("newest");
    setPage(1);
    setCalOffset(0);
    setSortOpen(false);
    setCategoryOpen(false);
    setDateRangeOpen(false);
  }

  return (
    <StudentShell active="Search" userName={user.name} userRole={user.role} pageTitle="Search Items" logout={handleLogout}>
      <main className="bg-white min-h-[calc(100vh-52px)] pb-24 sm:pb-28 lg:pb-6 flex flex-col">
        <div className="px-4 sm:px-6 lg:px-12 pt-4 sm:pt-5 lg:pt-6 w-full flex flex-col">
          {/* Search + filters — shared layout with the admin pages. */}
          <FilterPanel
            search={
              <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="w-full"
                size="lg" clearable placeholder="Search items..." />
            }
            filters={
              <div className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-2 sm:contents">
                <VDropdown
                  open={categoryOpen}
                  onOpenChange={setCategoryOpen}
                  width="w-56"
                  align="left"
                  trigger={
                    <VFilterButton active={!!selectedCategory} className="w-full justify-between sm:w-auto sm:min-w-[170px]"
                      onClick={() => setCategoryOpen(!categoryOpen)}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        {selectedCategory ? (
                          <>{(() => { const cc = categories.find(c => c.label === selectedCategory); return cc ? <cc.icon size={14} style={{ color: cc.color }} /> : null; })()}<span className="truncate">{selectedCategory}</span></>
                        ) : (
                          <><Grid3X3 size={14} style={{ color: c.textMuted }} /><span>All Categories</span></>
                        )}
                      </span>
                      <ChevronDown size={13} className="shrink-0" style={{ color: selectedCategory ? c.primary : c.textMuted }} />
                    </VFilterButton>
                  }
                >
                  {(close) => (
                    <>
                      <VDropdownItem active={!selectedCategory} onSelect={() => { setSelectedCategory(null); close(); setPage(1); }}>
                        <Grid3X3 size={14} style={{ color: c.textMuted }} />
                        All Categories
                      </VDropdownItem>
                      <div style={{ borderColor: c.border }} className="mx-3 border-t" />
                      {categories.map((cat) => (
                        <VDropdownItem key={cat.label} active={selectedCategory === cat.label}
                          onSelect={() => { setSelectedCategory(cat.label); close(); setPage(1); }}>
                          <cat.icon size={14} style={{ color: cat.color }} />
                          {cat.label}
                        </VDropdownItem>
                      ))}
                    </>
                  )}
                </VDropdown>
                <VDropdown
                  open={sortOpen}
                  onOpenChange={setSortOpen}
                  width="w-40"
                  trigger={
                    <VFilterButton active={sortOrder !== "newest"} className="w-full justify-between sm:w-auto sm:min-w-[140px]"
                      onClick={() => setSortOpen(!sortOpen)}>
                      <span className="flex items-center gap-1.5">
                        <ArrowUpDown size={13} style={{ color: sortOrder !== "newest" ? c.primary : c.textMuted }} />
                        <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
                      </span>
                      <ChevronDown size={12} className="shrink-0" style={{ color: sortOrder !== "newest" ? c.primary : c.textMuted }} />
                    </VFilterButton>
                  }
                >
                  {(close) => (
                    <>
                      {["newest", "oldest"].map((opt) => (
                        <VDropdownItem key={opt} active={sortOrder === opt}
                          onSelect={() => { setSortOrder(opt); close(); setPage(1); }}>
                          {opt === "newest" ? "Newest" : "Oldest"}
                        </VDropdownItem>
                      ))}
                    </>
                  )}
                </VDropdown>
                <div ref={dateFilterRef} className="relative min-w-0 w-full sm:w-auto sm:shrink-0"
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "mouse") return;
                    event.currentTarget.closest("[data-filter-panel]")?.dispatchEvent(new CustomEvent("vaultq:filter-hover", { detail: event.currentTarget }));
                    if (!dateRangeOpen) openDateCalendar();
                  }}>
                  <VFilterButton active={!!dateFrom} className="justify-between w-full sm:w-auto sm:min-w-[160px] sm:max-w-[16rem]"
                    aria-haspopup="dialog" aria-expanded={dateRangeOpen} aria-controls="search-date-range"
                    onClick={() => { if (dateRangeOpen) closeDateCalendar(); else openDateCalendar(); }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Clock size={14} className="shrink-0" style={{ color: dateFrom ? c.primary : c.textMuted }} />
                      <span className="vq-date min-w-0 truncate">
                        {dateFrom && dateTo && dateFrom !== dateTo
                          ? fmtRange(dateFrom, dateTo)
                          : dateFrom && dateTo
                            ? fmtDay(parseDate(dateFrom))
                            : dateFrom
                              ? `${fmtDay(parseDate(dateFrom))} - ?`
                              : "Select date"}
                      </span>
                    </span>
                    <ChevronDown size={13} className="shrink-0" style={{ color: dateFrom ? c.primary : c.textMuted }} />
                  </VFilterButton>
                  {dateRangeOpen && (
                    <FloatingPanel anchor={dateFilterRef.current} onClose={closeDateCalendar} closeOnPointerLeave
                      offsetY={8} fallbackWidth={300} fallbackHeight={380}>
                      <div id="search-date-range" role="dialog" aria-label="Select date range"
                        className="w-[300px] max-w-[calc(100vw-3rem)] rounded-2xl border bg-white p-4 shadow-xl" style={{ borderColor: c.border }}>
                        <div className="flex items-center justify-between mb-3">
                          <button type="button"
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer"
                            style={{ backgroundColor: c.fill, color: c.textMuted }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.fill; }}
                            onClick={() => setCalOffset(calOffset - 1)}>
                            <ChevronLeft size={14} />
                          </button>
                          <span className="text-xs font-medium" style={{ color: c.primary }}>
                            {months[0].toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                          </span>
                          <button type="button"
                            disabled={calOffset >= 0}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-150 ${calOffset >= 0 ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                            style={{ backgroundColor: c.fill, color: c.textMuted }}
                            onMouseEnter={(e) => { if (calOffset < 0) e.currentTarget.style.backgroundColor = c.borderLight; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.fill; }}
                            onClick={() => { if (calOffset < 0) setCalOffset(calOffset + 1); }}>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 text-center">
                          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                            <span key={d} className="text-[10px] font-semibold py-1" style={{ color: c.textMuted }}>{d}</span>
                          ))}
                          {monthGrid(months[0].getFullYear(), months[0].getMonth()).map((d, i) => {
                            if (!d) return <span key={i} />;
                            const iso = toISO(d);
                            const isStart = tempFrom === iso;
                            const isEnd = tempTo === iso && tempTo !== tempFrom;
                            const inRange = isInRange(d);
                            const isFuture = iso > todayIso;
                            return (
                              <button key={i} type="button"
                                disabled={isFuture}
                                className={`h-8 w-8 mx-auto rounded-full text-xs transition-all duration-150 ${isFuture ? "cursor-not-allowed" : "cursor-pointer"}`}
                                style={{
                                  backgroundColor: isFuture ? "transparent" : isStart || isEnd ? c.primary : inRange ? c.primarySoft : "transparent",
                                  color: isFuture ? c.textLight : isStart || isEnd ? "#fff" : c.text,
                                  fontWeight: isStart || isEnd ? "700" : "400",
                                }}
                                onMouseEnter={(e) => { if (!isFuture && !isStart && !isEnd) e.currentTarget.style.backgroundColor = c.fill; }}
                                onMouseLeave={(e) => { if (!isFuture && !isStart && !isEnd) e.currentTarget.style.backgroundColor = inRange ? c.primarySoft : "transparent"; }}
                                onClick={() => {
                                  if (isFuture) return;
                                  if (tempFrom && tempTo && tempFrom !== tempTo) {
                                    setTempFrom(iso);
                                    setTempTo(iso);
                                    return;
                                  }
                                  if (!tempFrom) {
                                    setTempFrom(iso);
                                    setTempTo(iso);
                                    return;
                                  }
                                  if (iso === tempFrom) {
                                    setTempTo(iso);
                                    return;
                                  }
                                  if (iso < tempFrom) {
                                    setTempFrom(iso);
                                    setTempTo(iso);
                                  } else {
                                    setTempTo(iso);
                                  }
                                }}>
                                {d.getDate()}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: c.fill }}>
                          <button type="button"
                            className="h-8 px-3 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer"
                            style={{ backgroundColor: c.fill, color: c.textMuted }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.fill; }}
                            onClick={() => { setTempFrom(""); setTempTo(""); }}>
                            Clear
                          </button>
                          <button type="button"
                            className="h-8 px-4 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                            style={{ backgroundColor: c.primary, color: "#fff" }}
                            onMouseEnter={(e) => { if (tempFrom) e.currentTarget.style.backgroundColor = c.primaryDark; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.primary; }}
                            onClick={() => {
                              if (!tempFrom) {
                                setDateFrom("");
                                setDateTo("");
                                setPage(1);
                                closeDateCalendar();
                                return;
                              }
                              setDateFrom(tempFrom);
                              setDateTo(tempTo || tempFrom);
                              setPage(1);
                              closeDateCalendar();
                            }}>
                            Confirm
                          </button>
                        </div>
                      </div>
                    </FloatingPanel>
                  )}
                </div>
                <ResetFiltersButton disabled={!hasFilters} onClick={resetFilters} className="w-full sm:w-auto" />
              </div>
            }
          />

          {/* Items grid */}
          <VContentPanel>
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <VCard key={i} className="p-4 sm:p-5 animate-pulse">
                  <div className="w-full h-32 sm:h-40 rounded-xl mb-3 sm:mb-4" style={{ backgroundColor: c.fill }} />
                  <div className="h-4 w-2/3 rounded mb-2" style={{ backgroundColor: c.fill }} />
                  <div className="h-3 w-1/2 rounded mb-4" style={{ backgroundColor: c.fill }} />
                  <div className="h-9 w-full rounded-xl" style={{ backgroundColor: c.fill }} />
                </VCard>
              ))}
            </div>
          ) : loadError ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load items</p>
              <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{loadError}</p>
              <VButton variant="secondary" onClick={() => { const t = getBrowserSessionKey(); if (t) void loadData(t); }}>
                <RefreshCw size={14} /> Try again
              </VButton>
            </VCard>
          ) : filtered.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>No items found</p>
              <p className="text-sm mt-1" style={{ color: c.textMuted }}>Try adjusting your filters or search term.</p>
            </VCard>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 content-start">
                {paginated.map((item) => {
                  const Icon = filterIcons[item.category] || Package;
                  const claimed = claimedItemIds.has(item.id);
                  const ownReport = item.reportedByMe;
                  const unavailable = claimed || ownReport || item.status !== "FOUND";
                  return (
                    <VCard key={item.id} className="p-3 sm:p-5 grid grid-cols-[96px_minmax(0,1fr)] sm:flex sm:flex-col gap-x-3 transition-all duration-200 hover:shadow-lg cursor-pointer" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }} onClick={() => setViewItem(item)}>
                      <div className="w-24 h-24 sm:w-full sm:h-40 rounded-xl sm:mb-4 flex items-center justify-center relative overflow-hidden cursor-pointer"
                        style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}
                        onClick={() => setViewItem(item)}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="absolute inset-0 w-full h-full object-contain" />
                        ) : (
                          <>
                            <div className="absolute inset-0 opacity-40"
                              style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                            <Icon size={40} style={{ color: c.primary, opacity: 0.6 }} />
                          </>
                        )}
                      </div>
                      <div className="min-w-0 py-0.5 sm:py-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-semibold line-clamp-2 cursor-pointer hover:opacity-80" style={{ color: c.text }} onClick={() => setViewItem(item)}>{item.name}</h3>
                          <VBadge color={item.color}>{item.statusLabel}</VBadge>
                        </div>
                        <p className="text-[13px] flex items-center gap-1" style={{ color: c.textMuted }}>
                          <MapPin size={13} style={{ color: c.textMuted }} /> {item.location || "—"}
                        </p>
                        <p className="text-[13px] flex items-center gap-1 mt-1" style={{ color: c.textMuted }}>
                          <Clock size={13} style={{ color: c.textLight }} /> <time className="vq-date">{fmtItemDate(item.date)}</time>
                        </p>
                      </div>
                      <div className="col-span-2 flex items-center gap-2 mt-3 sm:mt-4" onClick={(e) => e.stopPropagation()}>
                        <button type="button"
                          className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                          style={{ borderColor: c.border, color: c.textMuted }}
                          onClick={() => setViewItem(item)}>
                          <Eye size={13} /> View Details
                        </button>
                        <button type="button"
                          disabled={unavailable}
                          className="flex-1 h-9 rounded-lg text-xs font-medium transition-all duration-200"
                          style={{
                            backgroundColor: unavailable ? c.borderLight : c.primary,
                            color: unavailable ? c.textMuted : "#fff",
                            boxShadow: unavailable ? "none" : "0 2px 6px rgba(53,92,138,0.25)",
                            cursor: unavailable ? "not-allowed" : "pointer",
                          }}
                          onMouseEnter={(e) => { if (!unavailable) { e.currentTarget.style.backgroundColor = c.primaryDark; e.currentTarget.style.boxShadow = "0 3px 10px rgba(41,72,106,0.3)"; } }}
                          onMouseLeave={(e) => { if (!unavailable) { e.currentTarget.style.backgroundColor = c.primary; e.currentTarget.style.boxShadow = "0 2px 6px rgba(53,92,138,0.25)"; } }}
                          onClick={() => openClaim(item)}>
                          {claimed ? <><CheckCircle2 size={13} /> Claim submitted</> : ownReport ? "You reported this" : "Claim"}
                        </button>
                      </div>
                    </VCard>
                  );
                })}
              </div>
              <VPaginationFooter current={currentPage} total={totalPages} pageSize={pageSize} itemCount={filtered.length} onPage={setPage} />
            </>
          )}
          </VContentPanel>
        </div>
      </main>

      {viewItem && (
        <ItemDetailsModal
          title={viewItem.name}
          statusLabel={viewItem.statusLabel}
          statusColor={viewItem.color}
          category={viewItem.category}
          location={viewItem.location}
          date={fmtItemDate(viewItem.date)}
          description={viewItem.description}
          photos={viewItem.imageUrl ? [viewItem.imageUrl] : []}
          onClose={() => setViewItem(null)}
          footer={<>
            <VButton variant="secondary" className="flex-1" onClick={() => setViewItem(null)}>Close</VButton>
            <VButton
              className="flex-1"
              onClick={() => openClaim(viewItem)}
              disabled={claimedItemIds.has(viewItem.id) || viewItem.reportedByMe || viewItem.status !== "FOUND"}>
              {claimedItemIds.has(viewItem.id)
                ? "Claim submitted"
                : viewItem.reportedByMe
                  ? "You reported this"
                  : "Claim this item"}
            </VButton>
          </>}
        />
      )}

      {lostReportPreview && (
        <ItemDetailsModal
          zIndex="z-[70]"
          title={lostReportPreview.report.itemName}
          statusLabel="Lost report"
          statusColor="#355C8A"
          category={lostReportPreview.report.category}
          location={lostReportPreview.report.location || "—"}
          date={lostReportPreview.report.date ? fmtItemDate(lostReportPreview.report.date) : "—"}
          description={lostReportPreview.report.description}
          photos={lostReportPreview.report.images}
          photoIndex={lostReportPreview.index}
          onPhotoIndexChange={(index) => setLostReportPreview((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setLostReportPreview(null)}
          footer={<VButton variant="secondary" className="flex-1" onClick={() => setLostReportPreview(null)}>Close</VButton>}
        />
      )}

      {/* Always offer the student's pending lost reports before claiming */}
      {linkPromptItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { setLinkPromptItem(null); setLinkSkipConfirmed(false); }} />
          <VCard className="relative w-full max-w-lg p-6 lg:p-7 max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Link a lost report?</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>
                  Link the matching report to automatically copy its details and photos into your claim. You can review and edit them before submitting.
                </p>
              </div>
              <button type="button" onClick={() => { setLinkPromptItem(null); setLinkSkipConfirmed(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer shrink-0 ml-3"
                style={{ backgroundColor: c.primarySoft, color: c.primary }} aria-label="Close link lost report dialog">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-auto mb-4">
              {lostReports.map((report) => {
                const selected = linkChoice === report.id;
                return (
                  <div key={report.id}
                    className="w-full flex items-center gap-2 rounded-xl border transition-colors duration-150"
                    style={{ borderColor: selected ? c.primary : c.borderLight, backgroundColor: selected ? c.primarySoft : c.card }}>
                    <button type="button" onClick={() => { setLinkChoice(selected ? null : report.id); setLinkSkipConfirmed(false); }}
                      className="flex-1 min-w-0 flex items-start gap-3 p-3 text-left cursor-pointer">
                      <span className="mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                        style={{ borderColor: selected ? c.primary : c.border }}>
                        {selected && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate" style={{ color: c.text }}>{report.itemName}</span>
                        <span className="block text-[11px] mt-0.5" style={{ color: c.textMuted }}>
                          {report.category}{report.date && <> · <time className="vq-date">{fmtItemDate(report.date)}</time></>}
                        </span>
                      </span>
                    </button>
                    <button type="button" onClick={() => openLostReportPreview(report)}
                      className="mr-2 h-8 px-2.5 rounded-lg border bg-white text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      style={{ borderColor: c.border, color: c.primary }}>
                      <Eye size={12} /> View
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={() => { setLinkChoice(null); setLinkSkipConfirmed(false); }}
                className="w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors duration-150 cursor-pointer"
                style={{ borderColor: linkChoice === null ? c.primary : c.borderLight, backgroundColor: linkChoice === null ? c.primarySoft : c.card }}>
                <span className="mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                  style={{ borderColor: linkChoice === null ? c.primary : c.border }}>
                  {linkChoice === null && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />}
                </span>
                <span className="text-sm" style={{ color: c.text }}>Don&apos;t link a lost report</span>
              </button>
              {linkChoice === null && (
                <div className="rounded-xl border p-3 text-[11px] leading-relaxed" style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                  This claim will not be linked to a lost report. If one of your pending reports is for this item, it will stay open and may be matched separately.
                  <label className="mt-2 flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={linkSkipConfirmed}
                      onChange={(event) => setLinkSkipConfirmed(event.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#92400e]" />
                    <span>I confirm this item is not from my pending lost report(s).</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <VButton variant="secondary" onClick={() => { setLinkPromptItem(null); setLinkSkipConfirmed(false); }}>Cancel</VButton>
              <VButton disabled={linkChoice === null && !linkSkipConfirmed}
                onClick={() => { const item = linkPromptItem; const reportId = linkChoice; setLinkPromptItem(null); setLinkSkipConfirmed(false); startClaim(item, reportId); }}>
                Continue
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {/* Claim evidence modal */}
      {claimItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={closeClaim} />
          <VCard className="relative w-full max-w-lg p-6 lg:p-7 max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Claim Item</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{claimItem.name} · {claimItem.category} · {claimItem.location || "—"}</p>
              </div>
              <button type="button" onClick={closeClaim} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer shrink-0 ml-3" style={{ backgroundColor: c.primarySoft, color: c.primary }}><X size={16} /></button>
            </div>

            {claimPrefilling && <p role="status" className="text-xs mb-3" style={{ color: c.primary }}>Loading photos from your lost report…</p>}
            <fieldset disabled={claimPrefilling || claimSubmitting} className="space-y-4 min-w-0">
              {claimReportId && (() => {
                const linked = lostReports.find((report) => report.id === claimReportId);
                if (!linked) return null;
                return (
                  <div className="rounded-xl border p-3 flex items-center gap-3"
                    style={{ borderColor: c.borderLight, backgroundColor: c.fill }}>
                    <FileText size={16} className="shrink-0" style={{ color: c.primary }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: c.text }}>Linked lost report: {linked.itemName}</p>
                      <p className="text-[11px]" style={{ color: c.textMuted }}>
                        {linked.category}{linked.date && <> · <time className="vq-date">{fmtItemDate(linked.date)}</time></>}
                      </p>
                    </div>
                    <button type="button" onClick={() => openLostReportPreview(linked)}
                      className="h-8 px-2.5 rounded-lg border bg-white text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      style={{ borderColor: c.border, color: c.primary }}>
                      <Eye size={12} /> View
                    </button>
                  </div>
                );
              })()}
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Why is this yours? <span style={{ color: c.danger }}>*</span></label>
                <VTextarea value={claimReason} onChange={(e) => setClaimReason(e.target.value)} rows={3}
                  placeholder="Describe distinctive details, proof of ownership..." />
                {claimNoPhoto && (
                  <p className="text-[11px] mt-1 text-right"
                    style={{ color: claimReason.trim().length >= NO_PHOTO_REASON_MIN_LENGTH ? "#15803d" : c.danger }}>
                    {claimReason.trim().length}/{NO_PHOTO_REASON_MIN_LENGTH} characters for in-person verification
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <label className="text-sm font-medium" style={{ color: c.text }}>
                    Photo Evidence {!claimNoPhoto && <span style={{ color: c.danger }}>*</span>}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: c.textLight }}>{claimNoPhoto ? "No photo" : `${claimPhotos.length}/3`}</span>
                    {!claimNoPhoto && claimPhotos.length > 0 && claimPhotos.length < 3 && (
                      <button type="button" onClick={() => setClaimPhotoSourceOpen(true)}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white cursor-pointer"
                        style={{ borderColor: c.border, color: c.primary }}>
                        <Plus size={13} /> Add photo
                      </button>
                    )}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
                <input ref={claimCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
                {claimNoPhoto ? (
                  <div className="rounded-xl border-2 border-dashed p-4 text-center" style={{ borderColor: c.border, backgroundColor: c.fill }}>
                    <p className="text-xs font-semibold" style={{ color: c.text }}>No photo attached</p>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: c.textMuted }}>{NO_PHOTO_REASON_HELP}</p>
                    <button type="button" onClick={() => setClaimNoPhoto(false)}
                      className="mt-2 h-8 px-3 rounded-lg border bg-white text-[11px] font-semibold cursor-pointer"
                      style={{ borderColor: c.border, color: c.primary }}>
                      Add a photo instead
                    </button>
                  </div>
                ) : claimPhotos.length === 0 ? (
                  <div>
                    <PhotoPicker onUpload={() => fileRef.current?.click()} onTakePhoto={openClaimCamera} />
                    <button type="button" onClick={() => setClaimNoPhoto(true)}
                      className="mt-2 w-full h-8 rounded-lg text-[11px] font-semibold cursor-pointer"
                      style={{ color: c.primary }}>
                      I don&apos;t have a photo of this item
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-3 gap-2">
                      {claimPhotos.map((photo, index) => (
                        <div key={`${index}-${photo.file.name}`} className="relative group rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                          <button type="button" onClick={() => setClaimEditPhoto(index)}
                            className="block w-full cursor-pointer" aria-label={`View or crop evidence photo ${index + 1}`}>
                            <img src={photo.preview} alt={`Evidence ${index + 1}`}
                              className={`w-full object-contain ${claimPhotos.length === 1 ? "h-40" : "h-24"}`} />
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                                <Crop size={12} /> Crop
                              </span>
                            </span>
                          </button>
                          {photo.preview !== photo.originalPreview && (
                            <button type="button" aria-label={`Revert evidence photo ${index + 1} to original`}
                              className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/60 text-white text-[9px] font-semibold hover:bg-black/80 cursor-pointer"
                              onClick={() => setClaimPhotos((prev) =>
                                prev.map((entry, i) =>
                                  i === index
                                    ? { ...entry, file: entry.originalFile, preview: entry.originalPreview }
                                    : entry,
                                ),
                              )}>
                              <RotateCcw size={10} /> Revert
                            </button>
                          )}
                          <button type="button" aria-label={`Remove evidence photo ${index + 1}`}
                            onClick={() => setClaimPhotos((prev) => prev.filter((_, i) => i !== index))}
                            className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors duration-200 cursor-pointer">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!claimNoPhoto && (
                  <p className="text-[11px] mt-1.5 text-center" style={{ color: c.textLight }}>Up to 3 photos · 5MB max each</p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <VButton variant="secondary" onClick={closeClaim}>Cancel</VButton>
                <VButton onClick={handleSubmitClaim}
                  disabled={claimPrefilling || claimSubmitting || !claimReason.trim() || (claimNoPhoto ? claimReason.trim().length < NO_PHOTO_REASON_MIN_LENGTH : claimPhotos.length === 0)}>
                  <Upload size={14} /> {claimSubmitting ? "Submitting..." : "Submit Claim"}
                </VButton>
              </div>
              <p className="text-[11px] text-center" style={{ color: c.textLight }}>
                {claimNoPhoto
                  ? "No photo attached. Admin will verify your description in person before approval. False claims may be rejected."
                  : "Admin will verify your description + photo before approval. False claims may be rejected."}
              </p>
            </fieldset>
          </VCard>
        </div>
      )}

      {claimPhotoSourceOpen && (
        <PhotoSourceDialog
          title="Add evidence photo"
          description="Attach another photo for your claim (up to 3)."
          onClose={() => setClaimPhotoSourceOpen(false)}
          onTakePhoto={() => { setClaimPhotoSourceOpen(false); openClaimCamera(); }}
          onUpload={() => { setClaimPhotoSourceOpen(false); fileRef.current?.click(); }}
        />
      )}

      {claimCameraOpen && (
        <CameraCaptureModal
          onClose={() => setClaimCameraOpen(false)}
          onUseUpload={() => { setClaimCameraOpen(false); fileRef.current?.click(); }}
          onCapture={(photo) => {
            setClaimPhotos((prev) =>
              prev.length >= 3
                ? prev
                : [...prev, {
                    file: photo.file,
                    preview: photo.preview,
                    originalFile: photo.file,
                    originalPreview: photo.preview,
                  }],
            );
            setClaimCameraOpen(false);
          }}
        />
      )}

      {claimEditPhoto !== null && claimPhotos[claimEditPhoto] && (
        <PhotoCropModal
          src={claimPhotos[claimEditPhoto].preview}
          onClose={() => setClaimEditPhoto(null)}
          onSave={(photo) => {
            setClaimPhotos((prev) =>
              prev.map((entry, index) =>
                index === claimEditPhoto ? { ...entry, file: photo.file, preview: photo.preview } : entry,
              ),
            );
            setClaimEditPhoto(null);
          }}
        />
      )}
    </StudentShell>
  );
}
