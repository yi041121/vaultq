"use client";
import { getBrowserSessionKey, clearStoredBrowserSession } from "@/lib/browser-session-store";
import { formatDisplayDate as fmtDay, formatDisplayDate as fmtReportDate } from "@/lib/date-format";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PackageSearch, PackageCheck, Clock, X, CheckCircle2,
  Loader2, RefreshCw, Plus, FileText, RotateCcw,
  Grid3X3, Crop,
  ChevronDown, CircleAlert, ArrowLeftRight,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { compressImageFile, compressImageFileToDataUrl } from "@/lib/image-compression";
import { CameraCaptureModal } from "@/components/camera-capture-modal";
import { CalendarPopover } from "@/components/date-calendar";
import { PhotoViewerModal } from "@/components/photo-viewer-modal";
import { PhotoSourceDialog } from "@/components/photo-source-dialog";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { PhotoPicker } from "@/components/photo-picker";
import { CustomScrollbar } from "@/components/custom-scrollbar";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VContentPanel, VButton, VInput, VTextarea, VDropdown, VDropdownItem, VFilterButton, VEmptyState, vcolors as c,
} from "@/components/ui/vault";
import { ITEM_CATEGORIES } from "@/lib/categories";
import { CATEGORY_ICONS as categoryIcons } from "@/lib/category-icons";
import { mapReport, type UserReport } from "@/lib/report-mapper";
import { clearStudentCache, getCachedReports, setCachedReports } from "@/lib/student-cache";
import { useEscapeKey } from "@/lib/use-escape-key";
import { reportNextStep } from "@/lib/student-workflow";
import { scrollPageToTop } from "@/lib/scroll-to-top";
import { fetchReportPages } from "@/lib/report-pages";
import {
  REPORT_DESCRIPTION_HELPFUL,
  validateReportForm,
  type ReportFormErrors,
} from "@/lib/report-form";
import {
  clearReportDraft,
  hasDraftContent,
  loadReportDraft,
  saveReportDraft,
  type ReportDraft,
  type ReportDraftPhoto,
} from "@/lib/report-draft";
import { ReportCard } from "@/components/student/report-card";
import { ReportTypeChooser } from "@/components/student/report-type-chooser";
import { ReportMatchesPanel } from "@/components/student/report-matches-panel";
import { ReportListToolbar } from "@/components/student/report-list-toolbar";
import { ResetFiltersButton } from "@/components/filter-panel";
import { filterReports, statusIsAvailableFor, type ReportStatusFilter, type ReportTypeFilter } from "@/lib/report-list-filter";
import type { ReportSuggestion } from "@/lib/report-suggestions";

interface User { id: string; name: string; email: string; role: string; }
type ReportType = "LOST" | "FOUND";

function ReportingSteps({ type, size = "sm" }: { type: ReportType; size?: "sm" | "md" }) {
  const large = size === "md";
  return (
    <ol className={large ? "space-y-4" : "space-y-3"}>
      {[
        { title: "Describe the item", text: "Include its name, category and date. Add the location if you know it. Distinguishing details help identify it." },
        { title: "Add clear photos", text: "You can attach up to 3 photos. For lost items, show identifying features without sharing sensitive information." },
        { title: type === "FOUND" ? "Hand it in for verification" : "Track your report", text: type === "FOUND" ? "Bring the item to the Lost & Found office. Staff will verify the report and arrange storage." : "Check My reports for updates. Lost reports may show possible matches; found reports are verified by staff." },
      ].map((step, index) => (
        <li key={step.title} className={large ? "flex gap-3" : "flex gap-2.5"}>
          <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${large ? "h-7 w-7 text-xs" : "h-6 w-6 text-[11px]"}`} style={{ backgroundColor: c.primarySoft, color: c.primary }}>{index + 1}</span>
          <div>
            <p className={`font-semibold ${large ? "text-sm mb-1" : "text-xs mb-0.5"}`} style={{ color: c.text }}>{step.title}</p>
            <p className={`leading-relaxed ${large ? "text-xs" : "text-[11px]"}`} style={{ color: c.textMuted }}>{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ReportingHelpDialog({ type, onClose, returnFocus }: { type: ReportType; onClose: () => void; returnFocus: { current: HTMLButtonElement | null } }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEscapeKey(true, onClose);
  useEffect(() => {
    const previous = returnFocus.current ?? document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { queueMicrotask(() => { if (previous?.isConnected) previous.focus(); }); };
  }, [returnFocus]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={onClose} />
      <VCard id="reporting-help" role="dialog" aria-modal="true" aria-labelledby="reporting-help-title"
        className="relative w-full max-w-sm max-h-[85dvh] overflow-y-auto p-5"
        onKeyDown={(event) => { if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); } }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="reporting-help-title" className="text-base font-semibold" style={{ color: c.text }}>How reporting works</h2>
          <button ref={closeRef} type="button" aria-label="Close reporting help" onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer" style={{ backgroundColor: "rgba(15,23,42,0.7)", color: "#fff" }}><X size={17} /></button>
        </div>
        <ReportingSteps type={type} />
      </VCard>
    </div>
  );
}
type ReportPhoto = { file: File; preview: string; originalFile: File; originalPreview: string };
type EditPhoto = { preview: string; originalPreview: string };

/** Rebuilds an attachable File from a draft's compressed data URL. */
async function restoreDraftPhoto(photo: ReportDraftPhoto): Promise<ReportPhoto> {
  const response = await fetch(photo.preview);
  if (!response.ok) throw new Error("Could not restore a draft photo");
  const blob = await response.blob();
  const file = new File([blob], photo.name, {
    type: photo.type || blob.type || "image/jpeg",
    lastModified: Date.now(),
  });
  return { file, preview: photo.preview, originalFile: file, originalPreview: photo.preview };
}
type ItemDetail = {
  id: string;
  name: string;
  category: string;
  description: string;
  location: string;
  date: string;
  imageUrl: string | null;
  images: string[];
  imageIndex: number;
  statusLabel: string;
  color: string;
  isRejected?: boolean;
  reference?: string;
  adminNote?: string | null;
  nextStep?: string;
  report?: UserReport;
};

// Report type tags use their own colour and an outline style so they never
// look like the status pill beside them (e.g. "Lost" vs "Pending").
const FOUND_COLOR = "#4a9d6b";

/**
 * Type-specific filters must not linger after switching Lost/Found/All types.
 * Fall back to All statuses rather than silently narrowing to Pending.
 */
function statusForKind(kind: ReportTypeFilter, current: ReportStatusFilter): ReportStatusFilter {
  return statusIsAvailableFor(kind, current) ? current : "ALL";
}

function StudentReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"new" | "reports">("new");
  const [reportKind, setReportKind] = useState<ReportTypeFilter>("ALL");
  const [reportStatus, setReportStatus] = useState<ReportStatusFilter>("ALL");
  const [reportTypeOpen, setReportTypeOpen] = useState(false);
  const [reportQuery, setReportQuery] = useState("");
  const [duplicateReport, setDuplicateReport] = useState<{ itemName: string; type: ReportType } | null>(null);

  const [type, setType] = useState<ReportType | null>(null);
  const [expandedChoice, setExpandedChoice] = useState<ReportType | null>(null);
  const [reportHelpOpen, setReportHelpOpen] = useState(false);
  const reportHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [editingPhoto, setEditingPhoto] = useState<number | null>(null);
  const [cameraTarget, setCameraTarget] = useState<"new" | "edit" | null>(null);
  const [photoSourceTarget, setPhotoSourceTarget] = useState<"new" | "edit" | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const [editDateAnchor, setEditDateAnchor] = useState<HTMLElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<ReportType | null>(null);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [saveDraftPromptOpen, setSaveDraftPromptOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ReportSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionDetail, setSuggestionDetail] = useState<ReportSuggestion | null>(null);
  const [matchesReport, setMatchesReport] = useState<UserReport | null>(null);
  const suggestionRequestRef = useRef(0);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const activeSuggestionReportId = matchesReport?.id ?? submittedReportId;

  useEffect(() => () => { suggestionRequestRef.current++; }, []);
  useEffect(() => {
    if (!matchesReport && !submitted) return;
    resultHeadingRef.current?.focus({ preventScroll: true });
    scrollPageToTop();
  }, [matchesReport, submitted]);

  // Drafts are saved only when the student closes a non-empty form and
  // confirms "Save draft". Nothing is written while they are still typing.

  // Lock background scrolling and move focus into the report dialog.
  useEffect(() => {
    if (!type) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => formHeadingRef.current?.focus({ preventScroll: true }));
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
    };
  }, [type]);

  // Escape closes the form (asking to save a non-empty draft) unless a
  // nested dialog is already open.
  useEffect(() => {
    if (!type) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || submitting || reportHelpOpen || photoSourceTarget || cameraTarget || editingPhoto !== null || saveDraftPromptOpen) return;
      if (dateOpen) { setDateOpen(false); return; }
      if (categoryOpen) { setCategoryOpen(false); return; }
      event.preventDefault();
      closeReportForm();
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
    // closeReportForm is a stable component-scoped handler; state values below
    // decide whether a nested surface should receive Escape first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, submitting, reportHelpOpen, photoSourceTarget, cameraTarget, editingPhoto, dateOpen, categoryOpen, saveDraftPromptOpen]);


  const [reports, setReports] = useState<UserReport[]>(() => getCachedReports() ?? []);
  const [reportsLoading, setReportsLoading] = useState(() => getCachedReports() === null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<UserReport | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number; title: string } | null>(null);
  const [itemDetail, setItemDetail] = useState<ItemDetail | null>(null);
  const [editTarget, setEditTarget] = useState<UserReport | null>(null);
  const [editForm, setEditForm] = useState({ itemName: "", category: "", description: "", location: "", date: "" });
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [editDateOpen, setEditDateOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPhotosLoading, setEditPhotosLoading] = useState(false);
  const editRequestRef = useRef(0);
  const [editPhotos, setEditPhotos] = useState<EditPhoto[]>([]);
  const [editingEditPhoto, setEditingEditPhoto] = useState<number | null>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);
  const editCameraInputRef = useRef<HTMLInputElement>(null);
  const formScrollRef = useRef<HTMLDivElement>(null);
  const formDialogRef = useRef<HTMLDivElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const choiceRefs = useRef<Record<ReportType, HTMLButtonElement | null>>({ LOST: null, FOUND: null });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<ReportDraft | null>(null);

  const formValidation = validateReportForm({ type, itemName, category, description, location, date });
  // Errors stay hidden until the first submit attempt, then update live while
  // the student fixes each field.
  const formErrors: ReportFormErrors = submitAttempted ? formValidation : {};
  const descriptionLength = description.trim().length;

  async function loadReports(token: string) {
    if (!getCachedReports()) setReportsLoading(true);
    setReportsError(null);
    try {
      const res = await fetchReportPages("/api/reports?light=1", token);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load reports");
      const mapped = ((data.data ?? []) as Record<string, unknown>[]).map(mapReport);
      setReports(mapped);
      setCachedReports(mapped);
    } catch (e) {
      setReportsError(e instanceof Error ? e.message : "Failed to load reports");
      if (!getCachedReports()) setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }

  async function loadSuggestions(reportId: string, token: string) {
    const requestId = ++suggestionRequestRef.current;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/suggestions`, {
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not check for matches");
      }
      if (requestId === suggestionRequestRef.current) setSuggestions(Array.isArray(data.data) ? data.data : []);
    } catch (e) {
      if (requestId === suggestionRequestRef.current) setSuggestionsError(e instanceof Error ? e.message : "Could not check for matches");
    } finally {
      if (requestId === suggestionRequestRef.current) setSuggestionsLoading(false);
    }
  }

  function clearSubmission() {
    suggestionRequestRef.current++;
    setMatchesReport(null);
    setSubmitted(null);
    setSubmittedReportId(null);
    setSuggestions([]);
    setSuggestionsError(null);
    setSuggestionDetail(null);
    setSuggestionsLoading(false);
  }

  function checkReportMatches(report: UserReport) {
    const token = getBrowserSessionKey();
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }
    setMatchesReport(report);
    setSuggestionDetail(null);
    void loadSuggestions(report.id, token);
  }

  function claimSuggestion(suggestion: ReportSuggestion) {
    if (!activeSuggestionReportId) return;
    const params = new URLSearchParams({
      item: suggestion.id,
      report: activeSuggestionReportId,
    });
    router.push(`/dashboard/student/search?${params.toString()}`);
  }

  useEffect(() => {
    // Client-only mount flag; this is the standard hydration guard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = getBrowserSessionKey();
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
      setReportsLoading(false);
      setReportsError("Session expired — please sign in again");
      return;
    }
    setUser(JSON.parse(stored));
    void loadReports(token);

    const params = new URLSearchParams(window.location.search);
    const queryType = params.get("type");
    if (queryType === "lost") selectType("LOST");
    if (queryType === "found") selectType("FOUND");
    const queryKind = params.get("kind");
    if (queryKind === "LOST" || queryKind === "FOUND") {
      setReportKind(queryKind);
      setReportStatus((current) => statusForKind(queryKind, current));
    }
    if (params.get("tab") === "reports") setTab("reports");
  }, []);

  // Client-side notification navigation changes only the query string, so
  // react to it instead of forcing a full page reload.
  useEffect(() => {
    if (!mounted) return;
    const kind = searchParams.get("kind");
    // URL-driven tab/type sync; the query string is an external input.
    if (kind === "LOST" || kind === "FOUND") {
      /* eslint-disable react-hooks/set-state-in-effect */
      setReportKind(kind);
      setReportStatus((current) => statusForKind(kind, current));
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    const typeParam = searchParams.get("type");
    if (typeParam === "lost") selectType("LOST");
    if (typeParam === "found") selectType("FOUND");
    const tabParam = searchParams.get("tab");
    if (tabParam === "reports") setTab("reports");
    if (tabParam === "new") setTab("new");
  }, [searchParams, mounted]);

  function switchTab(next: "new" | "reports") {
    setTab(next);
    if (typeof window !== "undefined") {
      const url = next === "reports" ? "/dashboard/student/report?tab=reports" : "/dashboard/student/report";
      window.history.replaceState(null, "", url);
    }
  }

  function handleLogout() {
    clearReportDraft();
    clearStudentCache();
    clearStoredBrowserSession();
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  function resetForm() {
    setType(null);
    setExpandedChoice(null);
    setReportHelpOpen(false);
    setItemName("");
    setCategory(null);
    setDescription("");
    setLocation("");
    setDate("");
    setPhotos([]);
    setEditingPhoto(null);
    setCameraTarget(null);
    setPhotoSourceTarget(null);
    setCategoryOpen(false);
    setDateOpen(false);
    setSubmitAttempted(false);
    setSaveDraftPromptOpen(false);
  }

  function formHasContent() {
    return hasDraftContent({ itemName, category, description, location, date, photos });
  }

  /**
   * X, Cancel and Escape only offer the draft prompt when something was
   * entered. An untouched form closes immediately.
   */
  function closeReportForm() {
    if (submitting) return;
    if (formHasContent()) {
      setSaveDraftPromptOpen(true);
      return;
    }
    dismissReportForm();
  }

  function dismissReportForm() {
    const closingType = type;
    resetForm();
    // Return keyboard focus to the Lost/Found choice that opened the form.
    if (closingType) window.requestAnimationFrame(() => choiceRefs.current[closingType]?.focus());
  }

  function saveDraftAndClose() {
    const closingType = type;
    const owner = getBrowserSessionKey();
    const saved = Boolean(owner && closingType && saveReportDraft({
      owner,
      type: closingType,
      itemName,
      category,
      description,
      location,
      date,
      photos: photos.map((photo) => ({
        preview: photo.preview,
        name: photo.file.name,
        type: photo.file.type,
      })),
    }));
    setSaveDraftPromptOpen(false);
    if (!saved) {
      // Keep the form open so the student can remove a photo and retry
      // instead of silently losing everything.
      showCenteredMessage("error", "Could not save the draft on this device. Try removing a photo and saving again.");
      return;
    }
    dismissReportForm();
  }

  function discardAndClose() {
    clearReportDraft();
    setSaveDraftPromptOpen(false);
    dismissReportForm();
  }

  function selectType(next: ReportType, options: { skipDraft?: boolean } = {}) {
    if (!options.skipDraft) {
      const draft = loadReportDraft(getBrowserSessionKey());
      if (draft && draft.type === next && hasDraftContent(draft)) {
        setExpandedChoice(next);
        setDraftPrompt(draft);
        return;
      }
    }
    setType(next);
    setExpandedChoice(next);
    setSubmitAttempted(false);
    clearSubmission();
  }

  async function resumeDraft() {
    const draft = draftPrompt;
    if (!draft) return;
    setDraftPrompt(null);
    setType(draft.type);
    setExpandedChoice(draft.type);
    setItemName(draft.itemName);
    setCategory(draft.category);
    setDescription(draft.description);
    setLocation(draft.location);
    setDate(draft.date);
    setSubmitAttempted(false);
    clearSubmission();
    const draftPhotos = draft.photos ?? [];
    if (draftPhotos.length === 0) {
      setPhotos([]);
      return;
    }
    try {
      const restored = await Promise.all(draftPhotos.map(restoreDraftPhoto));
      setPhotos(restored.slice(0, 3));
    } catch {
      setPhotos([]);
      showCenteredMessage("error", "Draft restored, but the photos could not be opened.");
    }
  }

  function discardDraft() {
    const draft = draftPrompt;
    clearReportDraft();
    setDraftPrompt(null);
    if (draft) selectType(draft.type, { skipDraft: true });
  }

  /** Swap the open form to the other report type, keeping what was typed. */
  function switchReportType() {
    if (!type || submitting) return;
    const next: ReportType = type === "LOST" ? "FOUND" : "LOST";
    setExpandedChoice(next);
    selectType(next);
  }

  function activateChoice(next: ReportType) {
    const tapToExpand = window.matchMedia("(hover: none), (max-width: 767px)").matches;
    if (tapToExpand && expandedChoice !== next) {
      setExpandedChoice(next);
      return;
    }
    selectType(next);
  }

  function openCameraFor(target: "new" | "edit") {
    setPhotoSourceTarget(null);
    // Live camera requires a secure context (localhost or HTTPS). On other
    // origins, fall back to the device's native camera/file picker.
    if (window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function") {
      setCameraTarget(target);
      return;
    }
    if (target === "edit") editCameraInputRef.current?.click();
    else cameraInputRef.current?.click();
  }

  function toggleDateCalendar() {
    setDateOpen((open) => !open);
  }

  /** Keep Tab focus inside the report dialog while it is open. */
  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const root = formDialogRef.current;
    if (!root) return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (photos.length + files.length > 3) {
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
        files.map(async (file): Promise<ReportPhoto> => {
          const compressed = await compressImageFile(file);
          return {
            file: compressed.file,
            preview: compressed.preview,
            originalFile: compressed.file,
            originalPreview: compressed.preview,
          };
        }),
      );
      setPhotos((prev) => [...prev, ...drafts].slice(0, 3));
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Could not process one of the images");
    }
  }

  async function handleSubmit() {
    if (!type) return;
    setSubmitAttempted(true);
    const errors = validateReportForm({ type, itemName, category, description, location, date });
    if (Object.keys(errors).length > 0) {
      showCenteredMessage("error", "Please fix the highlighted fields");
      window.requestAnimationFrame(() => {
        formDialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    const token = getBrowserSessionKey();
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("itemName", itemName.trim());
      form.append("category", category || "");
      form.append("description", description.trim());
      form.append("location", location.trim());
      form.append("date", date);
      photos.forEach((photo) => form.append("photos", photo.file));

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        // A duplicate pending report is recoverable: offer the existing one
        // instead of a dead-end error toast.
        if (res.status === 409 && /already have a pending report/i.test(data?.error || "")) {
          setDuplicateReport({ itemName: itemName.trim(), type });
          return;
        }
        showCenteredMessage("error", data?.error || "Failed to submit report");
        return;
      }

      const submittedType = type;
      const newReportId = typeof data.data?.id === "string" ? data.data.id : null;
      clearReportDraft();
      resetForm();
      setSubmitted(submittedType);
      setMatchesReport(null);
      setSubmittedReportId(newReportId);
      setSuggestions([]);
      setSuggestionsError(null);
      setSuggestionDetail(null);
      showCenteredMessage(
        "success",
        submittedType === "LOST" ? "Lost item report submitted" : "Found item report submitted",
      );
      if (submittedType === "LOST" && newReportId) {
        void loadSuggestions(newReportId, token);
      }
      await loadReports(token);
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawTarget || withdrawing) return;
    const target = withdrawTarget;
    const token = getBrowserSessionKey();
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      setWithdrawTarget(null);
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/reports/${target.id}`, {
        method: "DELETE",
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to withdraw report");
        return;
      }
      const nextReports = reports.filter((r) => r.id !== target.id);
      setReports(nextReports);
      setCachedReports(nextReports);
      showCenteredMessage("success", "Report withdrawn");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to withdraw report");
    } finally {
      setWithdrawing(false);
      setWithdrawTarget(null);
    }
  }

  async function openEdit(report: UserReport) {
    const requestId = ++editRequestRef.current;
    setEditTarget(report);
    setEditForm({
      itemName: report.itemName,
      category: report.category,
      description: report.description,
      location: report.location,
      date: report.date,
    });
    setEditCategoryOpen(false);
    setEditDateOpen(false);
    setEditingEditPhoto(null);
    setEditPhotos(report.images.map((src) => ({ preview: src, originalPreview: src })));
    setEditPhotosLoading(true);

    const token = getBrowserSessionKey();
    if (!token) {
      setEditPhotosLoading(false);
      return;
    }

    // The list uses signed URLs so it stays small. Editing needs the original
    // image data, so fetch the full report only when the edit dialog opens.
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}`, {
        headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || requestId !== editRequestRef.current) return;
      const full = mapReport(data.data);
      setEditPhotos(full.images.map((src) => ({ preview: src, originalPreview: src })));
    } catch {
      // Keep the signed previews; saving stays blocked until full data loads.
    } finally {
      if (requestId === editRequestRef.current) setEditPhotosLoading(false);
    }
  }

  async function handleEditPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (editPhotos.length + files.length > 3) {
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
      setEditPhotos((prev) =>
        [...prev, ...previews.map((preview) => ({ preview, originalPreview: preview }))].slice(0, 3),
      );
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Could not process one of the images");
    }
  }

  async function handleSaveEdit() {
    if (!editTarget || savingEdit) return;
    if (editPhotosLoading) {
      showCenteredMessage("error", "Photos are still loading — please try again");
      return;
    }
    const photoPreviews = editPhotos.map((photo) => photo.preview);
    if (photoPreviews.some((src) => !src.startsWith("data:image/"))) {
      showCenteredMessage("error", "Photos are still loading — please try again");
      return;
    }
    const token = getBrowserSessionKey();
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }
    if (editForm.itemName.trim().length < 2) {
      showCenteredMessage("error", "Item name must be at least 2 characters");
      return;
    }
    if (editForm.description.trim().length < 5) {
      showCenteredMessage("error", "Description must be at least 5 characters");
      return;
    }
    const editLocation = editForm.location.trim();
    if (editTarget?.type === "FOUND" && editLocation.length < 2) {
      showCenteredMessage("error", "Found location must be at least 2 characters");
      return;
    }
    if (editLocation.length > 200) {
      showCenteredMessage("error", "Location must be at most 200 characters");
      return;
    }
    if (!editForm.date) {
      showCenteredMessage("error", "Please choose a date");
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/reports/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-VaultQ-Session": token, "X-VaultQ-Request": "1" },
        body: JSON.stringify({
          action: "update",
          itemName: editForm.itemName.trim(),
          category: editForm.category,
          description: editForm.description.trim(),
          location: editForm.location.trim(),
          date: editForm.date,
          imageUrls: photoPreviews,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to update report");
        return;
      }
      const updated = mapReport(data.data);
      const nextReports = reports.map((report) => (report.id === updated.id ? updated : report));
      setReports(nextReports);
      setCachedReports(nextReports);
      setEditTarget(null);
      showCenteredMessage("success", "Report updated");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to update report");
    } finally {
      setSavingEdit(false);
    }
  }

  // The report's own details: what was reported, its photos, the reference
  // and the admin guidance. This is where everything the compact card leaves
  // out is shown.
  function openReportDetail(report: UserReport) {
    setItemDetail({
      id: report.id,
      name: report.itemName,
      category: report.category,
      description: report.description,
      location: report.location,
      date: report.date,
      imageUrl: report.images[0] || null,
      images: report.images,
      imageIndex: 0,
      statusLabel: report.statusLabel,
      color: report.color,
      isRejected: report.status === "REJECTED",
      reference: report.reference,
      adminNote: report.adminNote,
      nextStep: reportNextStep(report.type, report.status),
      report,
    });
  }

  useEscapeKey(!!matchesReport, () => setMatchesReport(null));
  useEscapeKey(!!itemDetail && !viewer, () => setItemDetail(null));
  useEscapeKey(!!photoSourceTarget, () => setPhotoSourceTarget(null));
  // Escape deliberately does not close the report form: it must be dismissed
  // with Cancel, the backdrop, or by leaving the page.
  useEscapeKey(!!editTarget && !viewer && !photoSourceTarget && !cameraTarget && editingEditPhoto === null, () => {
    if (savingEdit) return;
    if (editDateOpen) { setEditDateOpen(false); return; }
    if (editCategoryOpen) { setEditCategoryOpen(false); return; }
    setEditTarget(null);
  });

  if (!user || !mounted) return null;

  const lostReportCount = reports.filter((report) => report.type === "LOST").length;
  const foundReportCount = reports.filter((report) => report.type === "FOUND").length;
  const visibleReports = filterReports(reports, { type: reportKind, status: reportStatus, query: reportQuery });
  // Distinguishes "you have no reports of this type" from "your filters hid
  // them", so an empty result never looks like missing data.
  const hasReportsOfType = reportKind === "ALL"
    ? reports.length > 0
    : reports.some((report) => report.type === reportKind);
  const kindLabel = reportKind === "ALL" ? "All types" : reportKind === "LOST" ? "Lost" : "Found";
  const reportFiltersActive = reportKind !== "ALL" || reportStatus !== "ALL" || reportQuery.trim().length > 0;

  function changeReportKind(next: ReportTypeFilter) {
    setReportKind(next);
    setReportStatus((current) => statusForKind(next, current));
  }

  /** Back to the default view: every type, every status, no search. */
  function resetReportFilters() {
    setReportKind("ALL");
    setReportStatus("ALL");
    setReportQuery("");
  }

  return (
    <StudentShell active="Report" userName={user.name} userRole={user.role} pageTitle="Report Items" logout={handleLogout}>
      <main className="bg-white min-h-[calc(100vh-52px)] pb-28 lg:pb-6">
        <div className="min-w-0 px-4 sm:px-6 lg:px-8 xl:px-10 pt-5 lg:pt-8 w-full flex flex-col items-stretch">
          <div data-filter-panel className="mb-6 flex shrink-0 flex-col gap-3 lg:mb-8 xl:flex-row xl:items-center">
            {/* Tabs sit in their own bordered container so they read as a
                separate control from the report search beside them. */}
            <div className="rounded-2xl border p-2 sm:w-fit" style={{ backgroundColor: c.panel, borderColor: c.border }}>
              <div className="flex h-12 w-full overflow-hidden rounded-xl border bg-white sm:w-[360px]" style={{ borderColor: c.border }}>
                <button type="button"
                  className="flex-1 h-full text-xs font-semibold transition-all duration-150 cursor-pointer"
                  style={{ backgroundColor: tab === "new" ? c.primary : "transparent", color: tab === "new" ? "#fff" : c.textMuted }}
                  onClick={() => { clearSubmission(); switchTab("new"); }}>
                  New report
                </button>
                <button type="button"
                  className="flex-1 h-full text-xs font-semibold transition-all duration-150 cursor-pointer border-l"
                  style={{ borderColor: c.border, backgroundColor: tab === "reports" ? c.primary : "transparent", color: tab === "reports" ? "#fff" : c.textMuted }}
                  onClick={() => { clearSubmission(); switchTab("reports"); }}>
                  My reports{reports.length > 0 ? ` (${reports.length})` : ""}
                </button>
              </div>
            </div>
            {tab === "reports" && (
              <div className="min-w-0 w-full rounded-2xl border p-2 xl:ml-auto xl:w-fit" style={{ backgroundColor: c.panel, borderColor: c.border }}>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <ReportListToolbar
                    query={reportQuery}
                    onQueryChange={setReportQuery}
                    type={reportKind}
                    status={reportStatus}
                    onStatusChange={setReportStatus}
                    trailing={
                      <>
                        <VDropdown open={reportTypeOpen} onOpenChange={setReportTypeOpen} width="w-[150px]" align="right"
                          trigger={
                            <VFilterButton
                              aria-label={`Filter by report type: ${kindLabel}`}
                              aria-haspopup="listbox" aria-expanded={reportTypeOpen}
                              className="w-[108px] justify-between sm:w-[124px]"
                              style={reportKind === "ALL" ? undefined : { borderColor: c.primary, color: c.primary, backgroundColor: c.primarySoft }}
                              onClick={() => setReportTypeOpen((open) => !open)}>
                              <span className="flex min-w-0 items-center gap-1.5">
                                {reportKind === "ALL"
                                  ? <Grid3X3 size={14} className="shrink-0" style={{ color: c.textMuted }} />
                                  : reportKind === "LOST"
                                    ? <PackageSearch size={14} className="shrink-0" style={{ color: c.primary }} />
                                    : <PackageCheck size={14} className="shrink-0" style={{ color: FOUND_COLOR }} />}
                                <span className="truncate">{kindLabel}</span>
                              </span>
                              <ChevronDown size={14} className="shrink-0" />
                            </VFilterButton>
                          }>
                          {(close) => (
                            <>
                              <VDropdownItem active={reportKind === "ALL"}
                                onSelect={() => { changeReportKind("ALL"); close(); }}>
                                <Grid3X3 size={14} style={{ color: c.textMuted }} /> All types ({reports.length})
                              </VDropdownItem>
                              <VDropdownItem active={reportKind === "LOST"}
                                onSelect={() => { changeReportKind("LOST"); close(); }}>
                                <PackageSearch size={14} style={{ color: c.primary }} /> Lost ({lostReportCount})
                              </VDropdownItem>
                              <VDropdownItem active={reportKind === "FOUND"}
                                onSelect={() => { changeReportKind("FOUND"); close(); }}>
                                <PackageCheck size={14} style={{ color: FOUND_COLOR }} /> Found ({foundReportCount})
                              </VDropdownItem>
                            </>
                          )}
                        </VDropdown>
                        <ResetFiltersButton disabled={!reportFiltersActive} onClick={resetReportFilters} />
                      </>
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <VContentPanel>
          {tab === "reports" ? (
            <div className="w-full min-w-0 flex-1 flex flex-col">
              {reportsLoading ? (
                <div className="space-y-4" aria-busy="true" aria-label="Loading your reports">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <VCard key={i} className="p-5 lg:p-6 animate-pulse">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl shrink-0" style={{ backgroundColor: c.fill }} />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/2 rounded" style={{ backgroundColor: c.fill }} />
                          <div className="h-3 w-2/3 rounded" style={{ backgroundColor: c.fill }} />
                        </div>
                      </div>
                      <div className="h-16 rounded-xl" style={{ backgroundColor: c.fill }} />
                    </VCard>
                  ))}
                </div>
              ) : reportsError ? (
                <VCard className="flex flex-1 flex-col">
                  <VEmptyState icon={FileText} tone="danger" role="alert" title="Could not load reports" description={reportsError}
                    action={<VButton variant="secondary" onClick={() => { const t = getBrowserSessionKey(); if (t) void loadReports(t); }}>
                      <RefreshCw size={14} /> Try again
                    </VButton>} />
                </VCard>
              ) : reports.length === 0 ? (
                <VCard className="flex flex-1 flex-col">
                  <VEmptyState icon={FileText} title="No reports yet"
                    description="Report a lost item or hand in something you found."
                    action={<VButton onClick={() => switchTab("new")}><Plus size={14} /> New report</VButton>} />
                </VCard>
              ) : (
                <div className="flex flex-1 flex-col gap-6 lg:gap-8">
                  {visibleReports.length === 0 && hasReportsOfType ? (
                    <VCard className="flex flex-1 flex-col">
                      <VEmptyState icon={PackageSearch} title="No reports match your filters"
                        description="Try a different search or show all statuses."
                        action={<VButton variant="secondary" onClick={resetReportFilters}>
                          <RotateCcw size={14} /> Clear filters
                        </VButton>} />
                    </VCard>
                  ) : visibleReports.length === 0 ? (
                    <VCard className="flex flex-1 flex-col">
                      <VEmptyState
                        icon={reportKind === "LOST" ? PackageSearch : reportKind === "FOUND" ? PackageCheck : FileText}
                        title={reportKind === "ALL" ? "No reports yet" : `No ${reportKind === "LOST" ? "lost" : "found"} reports`}
                        description={reportKind === "LOST"
                          ? "Report a lost item to start tracking it."
                          : reportKind === "FOUND"
                            ? "Report something you found so it can be returned."
                            : "Report a lost item or hand in something you found."}
                        action={<VButton onClick={() => {
                          switchTab("new");
                          if (reportKind !== "ALL") selectType(reportKind);
                        }}>
                          <Plus size={14} /> {reportKind === "ALL" ? "New report" : `Report ${reportKind === "LOST" ? "lost item" : "found item"}`}
                        </VButton>} />
                    </VCard>
                  ) : (
                  <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-5">
                  {visibleReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      onViewReport={openReportDetail}
                      onEditReport={openEdit}
                      onWithdrawReport={setWithdrawTarget}
                      onCheckMatches={checkReportMatches}
                      onViewClaims={() => router.push("/dashboard/student/claims")}
                    />
                  ))}
                  </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div data-report-workspace className="grid w-full min-w-0 mx-auto gap-6 items-start max-w-3xl flex-1 content-center">
              <div className="w-full min-w-0 max-w-3xl mx-auto xl:mx-0">
              {submitted ? (
                <div className="space-y-5">
                  <VCard className="p-8 lg:p-10 text-center">
                    <CheckCircle2 size={56} className="mb-5 mx-auto" style={{ color: c.accent }} />
                    <h2 ref={resultHeadingRef} tabIndex={-1} className="text-2xl font-bold mb-2" style={{ color: c.text }}>
                      {submitted === "LOST" ? "Lost Report Submitted" : "Found Report Submitted"}
                    </h2>
                    <p className="text-base mb-4 max-w-lg mx-auto" style={{ color: c.textMuted }}>
                      {submitted === "LOST"
                        ? "Review possible matches below."
                        : "Hand the item to the Lost & Found office so it can be verified and stored in a locker."}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <VButton variant="secondary" size="lg" onClick={() => { clearSubmission(); resetForm(); }}>
                        Report another
                      </VButton>
                      <VButton size="lg" onClick={() => {
                        const kind = submitted;
                        clearSubmission();
                        if (kind) setReportKind(kind);
                        switchTab("reports");
                      }}>
                        View my reports
                      </VButton>
                    </div>
                  </VCard>

                  {submitted === "LOST" && (
                    <ReportMatchesPanel
                      suggestions={suggestions}
                      loading={suggestionsLoading}
                      error={suggestionsError}
                      onRetry={() => {
                        const token = getBrowserSessionKey();
                        if (token && activeSuggestionReportId) void loadSuggestions(activeSuggestionReportId, token);
                      }}
                      onStartClaim={claimSuggestion}
                      onViewDetails={setSuggestionDetail}
                    />
                  )}
                </div>
              ) : (
                <div className={`flex flex-col py-4 lg:py-0 ${type ? "pointer-events-none select-none" : ""}`} aria-hidden={!!type}>
                  <ReportTypeChooser expandedChoice={expandedChoice} onActivate={activateChoice}
                    onButtonRef={(choice, node) => { choiceRefs.current[choice] = node; }} />
                </div>
              )}
              {type && (
                <div inert={reportHelpOpen} className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
                    onClick={() => { if (!submitting) closeReportForm(); }} />
                  <div ref={formDialogRef} role="dialog" aria-modal="true" aria-labelledby="report-form-title"
                    onKeyDown={trapFocus}
                    className="relative w-full max-w-[1120px] max-h-[92dvh] overflow-visible lg:overflow-y-auto">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
                  <div className="relative min-w-0">
                  <div ref={formScrollRef} className="vq-card vq-form-scroll bg-white rounded-2xl border min-w-0 p-6 sm:p-8 max-h-[calc(92dvh-2rem)] overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-visible"
                    style={{ borderColor: c.border, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                  <div className="flex items-center gap-2 mb-5">
                    <h2 id="report-form-title" ref={formHeadingRef} tabIndex={-1} className="min-w-0 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight" style={{ color: c.text }}>
                      Reporting: <span style={{ color: type === "LOST" ? c.textMuted : FOUND_COLOR }}>{type === "LOST" ? "Lost Item" : "Found Item"}</span>
                    </h2>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button type="button" aria-label={type === "LOST" ? "Switch to found report" : "Switch to lost report"}
                        title={type === "LOST" ? "Switch to found report" : "Switch to lost report"}
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#e6eef5]"
                        style={{ color: c.primary }}
                        onClick={switchReportType}>
                        <ArrowLeftRight size={17} />
                      </button>
                      <button ref={reportHelpTriggerRef} type="button" aria-label="How reporting works" aria-haspopup="dialog" aria-controls="reporting-help" aria-expanded={reportHelpOpen}
                        onClick={() => setReportHelpOpen(true)} className="lg:hidden w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer"
                        style={{ backgroundColor: c.primarySoft, color: c.primary }}><CircleAlert size={19} /></button>
                    </div>
                  </div>
                  {type === "FOUND" && (
                    <div className="rounded-xl p-3.5 mb-5 text-xs leading-relaxed flex gap-2" style={{ backgroundColor: `color-mix(in srgb, ${FOUND_COLOR} 8%, transparent)`, color: c.textMuted }}>
                      <PackageCheck size={16} className="shrink-0 mt-0.5" style={{ color: FOUND_COLOR }} />
                      <span>After submitting, hand the item to the Lost &amp; Found office. An admin will verify it and assign a locker.</span>
                    </div>
                  )}

                  <p className="mb-4 text-[11px]" style={{ color: c.textLight }}>
                    Fields marked <span style={{ color: c.danger }} aria-hidden="true">*</span> are required.
                  </p>

                  <div className="mb-5">
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="report-item-name" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                          Item name <span style={{ color: c.danger }} aria-hidden="true">*</span>
                        </label>
                        <VInput id="report-item-name" value={itemName} maxLength={100}
                          onChange={(e) => setItemName(e.target.value)}
                          aria-required="true" aria-invalid={!!formErrors.itemName}
                          aria-describedby={formErrors.itemName ? "report-item-name-error" : undefined}
                          placeholder={type === "LOST" ? "e.g. Black Adidas backpack" : "e.g. Silver Samsung phone"} />
                        {formErrors.itemName && (
                          <p id="report-item-name-error" role="alert" className="mt-1 text-[11px]" style={{ color: c.danger }}>{formErrors.itemName}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label id="report-category-label" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                            Category <span style={{ color: c.danger }} aria-hidden="true">*</span>
                          </label>
                          <VDropdown open={categoryOpen} onOpenChange={setCategoryOpen} width="w-full"
                            trigger={
                              <button type="button" aria-labelledby="report-category-label"
                                aria-required="true" aria-invalid={!!formErrors.category}
                                aria-describedby={formErrors.category ? "report-category-error" : undefined}
                                className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm border bg-white text-left cursor-pointer relative"
                                style={{ borderColor: formErrors.category ? c.danger : c.border, color: category ? c.text : c.textMuted, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                                onClick={() => setCategoryOpen(!categoryOpen)}>
                                {category
                                  ? (
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      {(() => { const Icon = categoryIcons[category] || Grid3X3; return <Icon size={14} className="shrink-0" style={{ color: c.primary }} />; })()}
                                      <span className="truncate">{category}</span>
                                    </span>
                                  )
                                  : <span>Select a category</span>}
                                <ChevronDown size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textMuted }} />
                              </button>
                            }>
                            {(close) => (
                              <>
                                {ITEM_CATEGORIES.map((cat) => {
                                  const Icon = categoryIcons[cat] || Grid3X3;
                                  return (
                                    <VDropdownItem key={cat} active={category === cat} onSelect={() => { setCategory(cat); close(); }}>
                                      <Icon size={15} style={{ color: c.primary }} /> {cat}
                                    </VDropdownItem>
                                  );
                                })}
                              </>
                            )}
                          </VDropdown>
                          {formErrors.category && (
                            <p id="report-category-error" role="alert" className="mt-1 text-[11px]" style={{ color: c.danger }}>{formErrors.category}</p>
                          )}
                        </div>
                        <div className="relative">
                          <label id="report-date-label" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                            {type === "LOST" ? "Date lost" : "Date found"} <span style={{ color: c.danger }} aria-hidden="true">*</span>
                          </label>
                          <VFilterButton
                            aria-labelledby="report-date-label" aria-required="true" aria-invalid={!!formErrors.date}
                            aria-describedby={formErrors.date ? "report-date-error" : undefined}
                            className="w-full justify-between"
                            style={{ height: 44, fontWeight: 400, color: date ? c.text : c.textMuted, boxShadow: "0 1px 3px rgba(0,0,0,0.02)", borderColor: formErrors.date ? c.danger : undefined }}
                            onClick={(e) => { setDateAnchor(e.currentTarget); toggleDateCalendar(); }}>
                            <span className="flex items-center gap-1.5 min-w-0">
                              <Clock size={14} style={{ color: c.primary }} />
                              <span className="vq-date truncate">{date ? fmtDay(date) : "Select date"}</span>
                            </span>
                            <ChevronDown size={13} style={{ color: c.textMuted }} />
                          </VFilterButton>

                          {dateOpen && (
                            <CalendarPopover anchor={dateAnchor} value={date}
                              onChange={setDate} onClose={() => setDateOpen(false)} />
                          )}
                          {formErrors.date && (
                            <p id="report-date-error" role="alert" className="mt-1 text-[11px]" style={{ color: c.danger }}>{formErrors.date}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="report-location" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                          {type === "LOST" ? "Last seen location" : "Found location"}{" "}
                          {type === "LOST"
                            ? <span className="font-normal" style={{ color: c.textLight }}>(optional)</span>
                            : <span style={{ color: c.danger }} aria-hidden="true">*</span>}
                        </label>
                        <VInput id="report-location" value={location} maxLength={200}
                          onChange={(e) => setLocation(e.target.value)}
                          aria-required={type === "FOUND"} aria-invalid={!!formErrors.location}
                          aria-describedby={formErrors.location ? "report-location-error" : undefined}
                          placeholder="e.g. Library 3rd Floor" />
                        {formErrors.location && (
                          <p id="report-location-error" role="alert" className="mt-1 text-[11px]" style={{ color: c.danger }}>{formErrors.location}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="report-description" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                          Description <span style={{ color: c.danger }} aria-hidden="true">*</span>
                        </label>
                        <VTextarea id="report-description" value={description} maxLength={2000}
                          onChange={(e) => setDescription(e.target.value)} rows={3}
                          aria-required="true" aria-invalid={!!formErrors.description}
                          aria-describedby={`report-description-help${formErrors.description ? " report-description-error" : ""}`}
                          placeholder="Provide details like color, brand and distinguishing features..." />
                        {formErrors.description && (
                          <p id="report-description-error" role="alert" className="mt-1 text-[11px]" style={{ color: c.danger }}>{formErrors.description}</p>
                        )}
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <p id="report-description-help" className="text-[11px] leading-relaxed" style={{ color: c.textLight }}>
                            Add colour, brand, distinguishing marks or contents.
                            {descriptionLength > 0 && descriptionLength < REPORT_DESCRIPTION_HELPFUL && (
                              <span style={{ color: "#b45309" }}> More detail improves matching.</span>
                            )}
                          </p>
                          <span className="shrink-0 text-[11px] tabular-nums"
                            style={{ color: descriptionLength >= REPORT_DESCRIPTION_HELPFUL ? "#15803d" : c.textLight }}>
                            {description.length}/2000
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: c.textMuted }}>
                        Photo Evidence <span className="font-normal normal-case tracking-normal" style={{ color: c.textLight }}>(optional)</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: c.textLight }}>{photos.length}/3</span>
                        {photos.length > 0 && photos.length < 3 && (
                          <button type="button"
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold border bg-white cursor-pointer hover:opacity-80"
                            style={{ borderColor: c.border, color: c.primary }}
                            onClick={() => setPhotoSourceTarget("new")}>
                            <Plus size={13} /> Add photo
                          </button>
                        )}
                      </div>
                    </div>
                    <input id="report-photo" type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
                    {photos.length === 0 ? (
                      <PhotoPicker
                        onUpload={() => document.getElementById("report-photo")?.click()}
                        onTakePhoto={() => openCameraFor("new")}
                      />
                    ) : (
                      <div className={`grid gap-2 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
                        {photos.map((photo, index) => (
                          <div key={`${photo.file.name}-${index}`} className="relative group rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                            <button type="button" onClick={() => setEditingPhoto(index)}
                              className="block w-full cursor-pointer" aria-label={`View or crop photo ${index + 1}`}>
                              <img src={photo.preview} alt={`Report preview ${index + 1}`}
                                className={`w-full object-contain ${photos.length === 1 ? "h-40" : "h-28"}`} />
                              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                                  <Crop size={13} /> View &amp; crop
                                </span>
                              </span>
                            </button>
                            {photo.preview !== photo.originalPreview && (
                              <button type="button"
                                aria-label={`Revert photo ${index + 1} to original`}
                                className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-black/60 text-white text-[10px] font-semibold hover:bg-black/80 cursor-pointer"
                                onClick={() => setPhotos((prev) =>
                                  prev.map((item, i) =>
                                    i === index
                                      ? { ...item, file: item.originalFile, preview: item.originalPreview }
                                      : item,
                                  ),
                                )}>
                                <RotateCcw size={11} /> Revert
                              </button>
                            )}
                            <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                              aria-label={`Remove photo ${index + 1}`}
                              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer">
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] mt-2 text-center" style={{ color: c.textLight }}>Up to 3 photos · 5MB max each</p>
                  </div>

                  <div data-report-actions className="flex items-center justify-center gap-3 pt-4 border-t mt-auto" style={{ borderColor: c.borderLight }}>
                    <VButton variant="secondary" size="lg" onClick={closeReportForm}>Cancel</VButton>
                    <VButton size="lg" onClick={handleSubmit} disabled={submitting}>
                      {submitting && <Loader2 size={15} className="animate-spin" />}
                      {submitting ? "Submitting..." : "Submit"}
                    </VButton>
                  </div>

                  </div>
                  <CustomScrollbar targetRef={formScrollRef} />
                  </div>
                  <aside className="hidden lg:block lg:sticky lg:top-0">
                    <VCard className="p-5">
                      <h3 className="text-base font-semibold mb-4" style={{ color: c.text }}>How reporting works</h3>
                      <ReportingSteps type={type} size="md" />
                    </VCard>
                  </aside>
                  </div>
                  </div>
                </div>
              )}
              {type && reportHelpOpen && <ReportingHelpDialog type={type} onClose={() => setReportHelpOpen(false)} returnFocus={reportHelpTriggerRef} />}
              </div>
            </div>
          )}
          </VContentPanel>
        </div>
      </main>

      {photoSourceTarget && (
        <PhotoSourceDialog
          onClose={() => setPhotoSourceTarget(null)}
          onTakePhoto={() => openCameraFor(photoSourceTarget)}
          onUpload={() => {
            const target = photoSourceTarget;
            setPhotoSourceTarget(null);
            if (target === "edit") editPhotoInputRef.current?.click();
            else document.getElementById("report-photo")?.click();
          }}
        />
      )}

      {cameraTarget && (
        <CameraCaptureModal
          onClose={() => setCameraTarget(null)}
          onUseUpload={() => {
            const target = cameraTarget;
            setCameraTarget(null);
            if (target === "edit") editPhotoInputRef.current?.click();
            else document.getElementById("report-photo")?.click();
          }}
          onCapture={(photo) => {
            if (cameraTarget === "edit") {
              setEditPhotos((prev) =>
                prev.length >= 3
                  ? prev
                  : [...prev, { preview: photo.preview, originalPreview: photo.preview }],
              );
            } else {
              setPhotos((prev) =>
                prev.length >= 3
                  ? prev
                  : [...prev, { ...photo, originalFile: photo.file, originalPreview: photo.preview }],
              );
            }
            setCameraTarget(null);
          }}
        />
      )}

      {editingPhoto !== null && photos[editingPhoto] && (
        <PhotoCropModal
          src={photos[editingPhoto].preview}
          onClose={() => setEditingPhoto(null)}
          onSave={(photo) => {
            setPhotos((prev) =>
              prev.map((item, index) =>
                index === editingPhoto ? { ...item, file: photo.file, preview: photo.preview } : item,
              ),
            );
            setEditingPhoto(null);
          }}
        />
      )}

      {editingEditPhoto !== null && editPhotos[editingEditPhoto] && (
        <PhotoCropModal
          src={editPhotos[editingEditPhoto].preview}
          onClose={() => setEditingEditPhoto(null)}
          onSave={(photo) => {
            setEditPhotos((prev) =>
              prev.map((item, index) =>
                index === editingEditPhoto ? { ...item, preview: photo.preview } : item,
              ),
            );
            setEditingEditPhoto(null);
          }}
        />
      )}

      {itemDetail && (
        <ItemDetailsModal
          title={itemDetail.name}
          statusLabel={itemDetail.statusLabel}
          statusColor={itemDetail.color}
          category={itemDetail.category}
          location={itemDetail.location}
          date={fmtReportDate(itemDetail.date)}
          description={itemDetail.description}
          photos={itemDetail.images}
          photoIndex={itemDetail.imageIndex}
          extra={itemDetail.reference ? (
            <span className="flex items-center gap-1">
              Ref <span className="font-mono text-xs">{itemDetail.reference}</span>
            </span>
          ) : undefined}
          notice={itemDetail.adminNote || itemDetail.nextStep ? (
            <div className="space-y-2.5">
              {itemDetail.adminNote && (
                <div role="note" className="flex gap-2 rounded-xl border p-3 text-xs leading-relaxed"
                  style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }}>
                  <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span><span className="font-semibold">Admin note: </span>{itemDetail.adminNote}</span>
                </div>
              )}
              {itemDetail.nextStep && (
                <p className="rounded-xl p-3 text-xs leading-relaxed"
                  style={{ backgroundColor: c.primarySoft, color: c.textMuted }}>
                  {itemDetail.nextStep}
                </p>
              )}
            </div>
          ) : undefined}
          onPhotoIndexChange={(index) => setItemDetail((prev) => (prev ? { ...prev, imageIndex: index } : prev))}
          onViewPhoto={() => setViewer({ photos: itemDetail.images, index: itemDetail.imageIndex, title: itemDetail.name })}
          onClose={() => setItemDetail(null)}
          footer={
            <>
              {itemDetail.report?.status === "PENDING" && (
                <>
                  <VButton variant="secondary" onClick={() => {
                    const report = itemDetail.report;
                    if (!report) return;
                    setItemDetail(null);
                    void openEdit(report);
                  }}>
                    Edit
                  </VButton>
                  <VButton variant="danger" onClick={() => {
                    const report = itemDetail.report;
                    if (!report) return;
                    setItemDetail(null);
                    setWithdrawTarget(report);
                  }}>
                    Withdraw
                  </VButton>
                </>
              )}
              <VButton variant="secondary" className="flex-1" onClick={() => setItemDetail(null)}>Close</VButton>
            </>
          }
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

      {editTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { if (!savingEdit) setEditTarget(null); }} />
          <VCard className="relative w-full max-w-lg max-h-[92vh] overflow-auto p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Edit report details</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{editTarget.typeLabel}</p>
              </div>
              <button type="button" onClick={() => { if (!savingEdit) setEditTarget(null); }} aria-label="Close edit report"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <p className="mb-3 text-[11px]" style={{ color: c.textLight }}>
              Fields marked <span style={{ color: c.danger }} aria-hidden="true">*</span> are required.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>
                  Item name <span style={{ color: c.danger }} aria-hidden="true">*</span>
                </label>
                <VInput value={editForm.itemName} maxLength={100}
                  onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })} />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>
                    Category <span style={{ color: c.danger }} aria-hidden="true">*</span>
                  </label>
                  <VDropdown open={editCategoryOpen} onOpenChange={setEditCategoryOpen} width="w-full"
                    trigger={
                      <button type="button"
                        className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm border bg-white text-left cursor-pointer relative"
                        style={{ borderColor: c.border, color: editForm.category ? c.text : c.textMuted, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                        onClick={() => setEditCategoryOpen(!editCategoryOpen)}>
                        {editForm.category
                          ? (
                            <span className="flex items-center gap-1.5 min-w-0">
                              {(() => { const Icon = categoryIcons[editForm.category] || Grid3X3; return <Icon size={14} className="shrink-0" style={{ color: c.primary }} />; })()}
                              <span className="truncate">{editForm.category}</span>
                            </span>
                          )
                          : <span>Select a category</span>}
                        <ChevronDown size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textMuted }} />
                      </button>
                    }>
                    {(close) => (
                      <>
                        {ITEM_CATEGORIES.map((cat) => {
                          const Icon = categoryIcons[cat] || Grid3X3;
                          return (
                            <VDropdownItem key={cat} active={editForm.category === cat}
                              onSelect={() => { setEditForm({ ...editForm, category: cat }); close(); }}>
                              <Icon size={15} style={{ color: c.primary }} /> {cat}
                            </VDropdownItem>
                          );
                        })}
                      </>
                    )}
                  </VDropdown>
                </div>

                <div className="relative">
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>
                    Date <span style={{ color: c.danger }} aria-hidden="true">*</span>
                  </label>
                  <VFilterButton className="w-full justify-between" style={{ height: 44, fontWeight: 400, color: editForm.date ? c.text : c.textMuted, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                    onClick={(e) => { setEditDateAnchor(e.currentTarget); setEditDateOpen((open) => !open); }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Clock size={14} style={{ color: c.primary }} />
                      <span className="vq-date truncate">{editForm.date ? fmtDay(editForm.date) : "Select date"}</span>
                    </span>
                    <ChevronDown size={13} style={{ color: c.textMuted }} />
                  </VFilterButton>

                  {editDateOpen && (
                    <CalendarPopover anchor={editDateAnchor} compact value={editForm.date}
                      onChange={(iso) => setEditForm((prev) => ({ ...prev, date: iso }))}
                      onClose={() => setEditDateOpen(false)} />
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>
                  Location{" "}
                  {editTarget?.type === "LOST"
                    ? <span className="font-normal" style={{ color: c.textLight }}>(optional)</span>
                    : <span style={{ color: c.danger }} aria-hidden="true">*</span>}
                </label>
                <VInput value={editForm.location} maxLength={200}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>
                  Description <span style={{ color: c.danger }} aria-hidden="true">*</span>
                </label>
                <VTextarea rows={4} value={editForm.description} maxLength={2000}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="text-xs font-semibold" style={{ color: c.text }}>
                    Photo Evidence <span className="font-normal" style={{ color: c.textLight }}>(optional)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: c.textLight }}>{editPhotos.length}/3</span>
                    {editPhotos.length > 0 && editPhotos.length < 3 && (
                      <button type="button" onClick={() => setPhotoSourceTarget("edit")}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white cursor-pointer"
                        style={{ borderColor: c.border, color: c.primary }}>
                        <Plus size={13} /> Add photo
                      </button>
                    )}
                  </div>
                </div>
                <input ref={editPhotoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEditPhotoChange} />
                <input ref={editCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleEditPhotoChange} />
                {editPhotos.length === 0 ? (
                  <PhotoPicker
                    onUpload={() => editPhotoInputRef.current?.click()}
                    onTakePhoto={() => openCameraFor("edit")}
                  />
                ) : (
                  <div className={`grid gap-2 ${editPhotos.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
                    {editPhotos.map((photo, index) => (
                      <div key={`edit-photo-${index}`} className="relative rounded-xl overflow-hidden border group" style={{ borderColor: c.border }}>
                        <button type="button" aria-label={`View or crop photo ${index + 1}`}
                          className="block w-full cursor-pointer"
                          onClick={() => setEditingEditPhoto(index)}>
                          <img src={photo.preview} alt={`Report photo ${index + 1}`}
                            className={`w-full object-contain ${editPhotos.length === 1 ? "h-32" : "h-20"}`} />
                          <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                              <Crop size={12} /> View &amp; crop
                            </span>
                          </span>
                        </button>
                        {photo.preview !== photo.originalPreview && (
                          <button type="button" aria-label={`Revert photo ${index + 1} to original`}
                            className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/60 text-white text-[9px] font-semibold hover:bg-black/80 cursor-pointer"
                            onClick={() => setEditPhotos((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, preview: item.originalPreview } : item)),
                            )}>
                            <RotateCcw size={10} /> Revert
                          </button>
                        )}
                        <button type="button" aria-label={`Remove photo ${index + 1}`}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
                          onClick={() => setEditPhotos((prev) => prev.filter((_, i) => i !== index))}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] mt-1 text-center" style={{ color: c.textLight }}>Up to 3 photos · 5MB max each</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t" style={{ borderColor: c.borderLight }}>
              <VButton variant="secondary" onClick={() => { if (!savingEdit) setEditTarget(null); }}>Cancel</VButton>
              <VButton onClick={handleSaveEdit} disabled={savingEdit || editPhotosLoading}>
                {savingEdit || editPhotosLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {savingEdit ? "Saving..." : editPhotosLoading ? "Loading photos..." : "Save changes"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {matchesReport && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => setMatchesReport(null)} />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto">
            <ReportMatchesPanel
              title={`Matches for ${matchesReport.itemName}`}
              headingRef={resultHeadingRef}
              onClose={() => setMatchesReport(null)}
              suggestions={suggestions}
              loading={suggestionsLoading}
              error={suggestionsError}
              onRetry={() => {
                const token = getBrowserSessionKey();
                if (token && activeSuggestionReportId) void loadSuggestions(activeSuggestionReportId, token);
              }}
              onStartClaim={(suggestion) => { claimSuggestion(suggestion); setMatchesReport(null); }}
              onViewDetails={setSuggestionDetail}
            />
          </div>
        </div>
      )}

      {suggestionDetail && (
        <ItemDetailsModal
          title={suggestionDetail.itemName}
          statusLabel="Found"
          statusColor={c.primary}
          category={suggestionDetail.category || "Others"}
          location={suggestionDetail.foundLocation}
          date={fmtDay(suggestionDetail.foundDate || "")}
          description={suggestionDetail.description}
          photos={suggestionDetail.imageUrl ? [suggestionDetail.imageUrl] : []}
          photoIndex={0}
          zIndex="z-[70]"
          onClose={() => setSuggestionDetail(null)}
          footer={
            <div className="flex w-full items-center justify-center gap-2">
              <VButton variant="secondary" onClick={() => setSuggestionDetail(null)}>Close</VButton>
              <VButton onClick={() => {
                const item = suggestionDetail;
                setSuggestionDetail(null);
                claimSuggestion(item);
              }}>
                Start claim
              </VButton>
            </div>
          }
        />
      )}

      <ConfirmDialog
        open={!!withdrawTarget}
        title="Withdraw this report?"
        subtitle={withdrawTarget ? withdrawTarget.itemName : undefined}
        cancelLabel="Keep report"
        confirmLabel={withdrawing ? "Withdrawing..." : "Withdraw"}
        onCancel={() => { if (!withdrawing) setWithdrawTarget(null); }}
        onConfirm={handleWithdraw}
      />

      <ConfirmDialog
        open={!!draftPrompt}
        title="Continue your saved draft?"
        subtitle="We kept the details and photos you added on this device."
        tone="primary"
        cancelLabel="Start new"
        confirmLabel="Continue draft"
        onCancel={discardDraft}
        onConfirm={() => { void resumeDraft(); }}
      />

      <ConfirmDialog
        open={saveDraftPromptOpen}
        title="Save this draft?"
        subtitle="Keep the details and photos you entered so you can continue on this device."
        tone="primary"
        cancelLabel="Discard"
        confirmLabel="Save draft"
        onCancel={discardAndClose}
        onDismiss={() => setSaveDraftPromptOpen(false)}
        onConfirm={saveDraftAndClose}
      />

      <ConfirmDialog
        open={!!duplicateReport}
        title="You already have a pending report"
        subtitle={duplicateReport ? `A pending report for “${duplicateReport.itemName}” already exists. Open My Reports to view or edit it instead of submitting a duplicate.` : undefined}
        tone="primary"
        cancelLabel="Keep editing"
        confirmLabel="View my reports"
        onCancel={() => setDuplicateReport(null)}
        onConfirm={() => {
          const duplicate = duplicateReport;
          if (!duplicate) return;
          setDuplicateReport(null);
          clearReportDraft();
          dismissReportForm();
          setReportKind(duplicate.type);
          setReportStatus("PENDING");
          setReportQuery(duplicate.itemName);
          switchTab("reports");
        }}
      />
    </StudentShell>
  );
}

export default function StudentReport() {
  return (
    <Suspense fallback={null}>
      <StudentReportContent />
    </Suspense>
  );
}
