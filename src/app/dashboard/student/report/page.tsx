"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PackageSearch, PackageCheck, Clock, X, CheckCircle2,
  Loader2, RefreshCw, Plus, FileText, RotateCcw,
  Monitor, Briefcase, CreditCard, Key, BookText, CupSoda, Grid3X3, Crop,
  ChevronDown, ZoomIn, MapPin, Eye,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { CameraCaptureModal } from "@/components/camera-capture-modal";
import { CalendarPopover } from "@/components/date-calendar";
import { PhotoViewerModal } from "@/components/photo-viewer-modal";
import { PhotoSourceDialog } from "@/components/photo-source-dialog";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { PhotoPicker } from "@/components/photo-picker";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VButton, VInput, VTextarea, VDropdown, VDropdownItem, VBadge, VFilterButton, vcolors as c,
} from "@/components/ui/vault";
import { ITEM_CATEGORIES } from "@/lib/categories";
import { mapReport, type UserReport } from "@/lib/report-mapper";
import { startsWithNumber } from "@/lib/text-validation";
import { useEscapeKey } from "@/lib/use-escape-key";

interface User { id: string; name: string; email: string; role: string; }
type ReportType = "LOST" | "FOUND";
type ReportPhoto = { file: File; preview: string; originalFile: File; originalPreview: string };
type EditPhoto = { preview: string; originalPreview: string };
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
};

const categoryIcons: Record<string, any> = {
  Electronics: Monitor,
  Bags: Briefcase,
  "Student Cards": CreditCard,
  Keys: Key,
  Documents: BookText,
  "Water Bottles": CupSoda,
  Others: Grid3X3,
};

// Lost and Found share one neutral tag colour so status tones stand out.
const TYPE_TAG_COLOR = "#64748b";

// Logged item statuses shown inside a report card. Once the report itself is
// VERIFIED the card shows "Verified" instead, matching the badge at the top.
const itemStatusLabel: Record<string, string> = {
  FOUND: "Found",
  CLAIMED: "Claimed",
  RETRIEVED: "Retrieved",
  EXPIRED: "Expired",
};

function fmtDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTimestamp(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Formats the report's own date (no time). */
function fmtReportDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtReportTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

let studentReportsCache: UserReport[] | null = null;

export default function StudentReport() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"new" | "reports">("new");

  const [type, setType] = useState<ReportType | null>(null);
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

  const [reports, setReports] = useState<UserReport[]>(studentReportsCache ?? []);
  const [reportsLoading, setReportsLoading] = useState(studentReportsCache === null);
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
  const [editPhotos, setEditPhotos] = useState<EditPhoto[]>([]);
  const [editingEditPhoto, setEditingEditPhoto] = useState<number | null>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);
  const editCameraInputRef = useRef<HTMLInputElement>(null);

  const formValid = !!(
    type && itemName.trim().length >= 2 && category && description.trim().length >= 5 &&
    location.trim().length >= 2 && date &&
    !startsWithNumber(itemName) && !startsWithNumber(description) && !startsWithNumber(location)
  );

  async function loadReports(token: string) {
    if (!studentReportsCache) setReportsLoading(true);
    setReportsError(null);
    try {
      const res = await fetch("/api/reports", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load reports");
      const mapped = (data.data as any[]).map(mapReport);
      setReports(mapped);
      studentReportsCache = mapped;
    } catch (e) {
      setReportsError(e instanceof Error ? e.message : "Failed to load reports");
      if (!studentReportsCache) setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
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
    if (queryType === "lost") setType("LOST");
    if (queryType === "found") setType("FOUND");
    if (params.get("tab") === "reports") setTab("reports");
  }, []);

  function switchTab(next: "new" | "reports") {
    setTab(next);
    if (typeof window !== "undefined") {
      const url = next === "reports" ? "/dashboard/student/report?tab=reports" : "/dashboard/student/report";
      window.history.replaceState(null, "", url);
    }
  }

  function handleLogout() {
    studentReportsCache = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  function resetForm() {
    setType(null);
    setItemName("");
    setCategory(null);
    setDescription("");
    setLocation("");
    setDate("");
    setPhotos([]);
    setEditingPhoto(null);
    setCameraTarget(null);
    setPhotoSourceTarget(null);
  }

  function selectType(next: ReportType) {
    setType(next);
    setSubmitted(null);
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

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (photos.length + files.length > 3) {
      showCenteredMessage("error", "You can upload up to 3 photos");
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        showCenteredMessage("error", "Please upload image files only");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showCenteredMessage("error", "Each image must be under 5MB");
        return;
      }
    }

    try {
      const drafts = await Promise.all(
        files.map(
          (file) =>
            new Promise<ReportPhoto>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const preview = reader.result as string;
                resolve({ file, preview, originalFile: file, originalPreview: preview });
              };
              reader.onerror = () => reject(new Error("Could not read image"));
              reader.readAsDataURL(file);
            }),
        ),
      );
      setPhotos((prev) => [...prev, ...drafts].slice(0, 3));
    } catch {
      showCenteredMessage("error", "Could not read one of the images");
    }
  }

  async function handleSubmit() {
    if (!type) return;
    if (startsWithNumber(itemName)) {
      showCenteredMessage("error", "Item name cannot start with a number");
      return;
    }
    if (startsWithNumber(description)) {
      showCenteredMessage("error", "Description cannot start with a number");
      return;
    }
    if (startsWithNumber(location)) {
      showCenteredMessage("error", "Location cannot start with a number");
      return;
    }
    if (!formValid) {
      showCenteredMessage("error", "Please complete all required fields");
      return;
    }
    const token = localStorage.getItem("token");
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
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to submit report");
        return;
      }

      const submittedType = type;
      resetForm();
      setSubmitted(submittedType);
      showCenteredMessage(
        "success",
        submittedType === "LOST" ? "Lost item report submitted" : "Found item report submitted",
      );
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
    const token = localStorage.getItem("token");
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      setWithdrawTarget(null);
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/reports/${target.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to withdraw report");
        return;
      }
      setReports((prev) => prev.filter((r) => r.id !== target.id));
      showCenteredMessage("success", "Report withdrawn");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to withdraw report");
    } finally {
      setWithdrawing(false);
      setWithdrawTarget(null);
    }
  }

  function openEdit(report: UserReport) {
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
      if (!file.type.startsWith("image/")) {
        showCenteredMessage("error", "Please upload image files only");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showCenteredMessage("error", "Each image must be under 5MB");
        return;
      }
    }
    try {
      const previews = await Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error("Could not read image"));
              reader.readAsDataURL(file);
            }),
        ),
      );
      setEditPhotos((prev) =>
        [...prev, ...previews.map((preview) => ({ preview, originalPreview: preview }))].slice(0, 3),
      );
    } catch {
      showCenteredMessage("error", "Could not read one of the images");
    }
  }

  async function handleSaveEdit() {
    if (!editTarget || savingEdit) return;
    const token = localStorage.getItem("token");
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }
    if (editForm.itemName.trim().length < 2) {
      showCenteredMessage("error", "Item name must be at least 2 characters");
      return;
    }
    if (startsWithNumber(editForm.itemName)) {
      showCenteredMessage("error", "Item name cannot start with a number");
      return;
    }
    if (editForm.description.trim().length < 5) {
      showCenteredMessage("error", "Description must be at least 5 characters");
      return;
    }
    if (startsWithNumber(editForm.description)) {
      showCenteredMessage("error", "Description cannot start with a number");
      return;
    }
    if (editForm.location.trim().length < 2) {
      showCenteredMessage("error", "Location must be at least 2 characters");
      return;
    }
    if (startsWithNumber(editForm.location)) {
      showCenteredMessage("error", "Location cannot start with a number");
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "update",
          itemName: editForm.itemName.trim(),
          category: editForm.category,
          description: editForm.description.trim(),
          location: editForm.location.trim(),
          date: editForm.date,
          imageUrls: editPhotos.map((photo) => photo.preview),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to update report");
        return;
      }
      const updated = mapReport(data.data);
      setReports((prev) => prev.map((report) => (report.id === updated.id ? updated : report)));
      setEditTarget(null);
      showCenteredMessage("success", "Report updated");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to update report");
    } finally {
      setSavingEdit(false);
    }
  }

  // Opens the logged item in a read-only details popup. The report data is
  // shown instantly, then refreshed from the item record when it arrives.
  async function openItemDetail(report: UserReport) {
    const item = report.item;
    if (!item) return;
    const statusLabel = report.status === "VERIFIED"
      ? "Found"
      : itemStatusLabel[item.status] || item.status;
    const color = report.status === "VERIFIED" ? report.color : c.textMuted;

    // Item details only ever show the inventory item's own photos. The lost
    // report photos stay in the separate report view.
    const initialImages = item.imageUrl ? [item.imageUrl] : [];

    setItemDetail({
      id: item.id,
      name: item.name,
      category: report.category,
      description: report.description,
      location: report.location,
      date: report.date,
      imageUrl: initialImages[0] || null,
      images: initialImages,
      imageIndex: 0,
      statusLabel,
      color,
    });

    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      const fresh = data?.data;
      if (!res.ok || !data?.success || !fresh) return;
      const reportImages: string[] = Array.isArray(fresh.reports)
        ? fresh.reports.flatMap((r: any) => (Array.isArray(r.imageUrls) ? r.imageUrls : []))
        : [];
      const images = Array.from(new Set([fresh.imageUrl, ...reportImages].filter(Boolean))) as string[];
      setItemDetail((prev) => {
        if (!prev || prev.id !== item.id) return prev;
        // Keep the photos already shown and add any new item photos.
        const merged = Array.from(new Set([...prev.images, ...images]));
        return {
          ...prev,
          name: fresh.itemName || prev.name,
          category: fresh.category || prev.category,
          description: fresh.description || prev.description,
          location: fresh.foundLocation || prev.location,
          date: fresh.foundDate ? String(fresh.foundDate).slice(0, 10) : prev.date,
          imageUrl: merged[0] || prev.imageUrl,
          images: merged,
          imageIndex: Math.min(prev.imageIndex, Math.max(0, merged.length - 1)),
        };
      });
    } catch {
      // Keep the report-derived details if the item lookup fails.
    }
  }

  // Matched reports keep the lost-report photo and description; View shows
  // what the student originally reported rather than the inventory record.
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
      statusLabel: "Lost",
      color: report.color,
    });
  }

  useEscapeKey(!!itemDetail && !viewer, () => setItemDetail(null));
  useEscapeKey(!!photoSourceTarget, () => setPhotoSourceTarget(null));
  useEscapeKey(!!editTarget && !viewer && !photoSourceTarget && !cameraTarget && editingEditPhoto === null, () => {
    if (savingEdit) return;
    if (editDateOpen) { setEditDateOpen(false); return; }
    if (editCategoryOpen) { setEditCategoryOpen(false); return; }
    setEditTarget(null);
  });

  if (!user || !mounted) return null;

  return (
    <StudentShell active="Report" userName={user.name} userRole={user.role} pageTitle="Report Items" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col items-center">
          {/* Tabs */}
          <div className="w-full max-w-3xl mx-auto flex rounded-xl border bg-white overflow-hidden mb-6" style={{ borderColor: c.border }}>
            <button type="button"
              className="flex-1 h-10 text-xs font-semibold transition-all duration-150 cursor-pointer"
              style={{ backgroundColor: tab === "new" ? c.primary : "transparent", color: tab === "new" ? "#fff" : c.textMuted }}
              onClick={() => switchTab("new")}>
              New report
            </button>
            <button type="button"
              className="flex-1 h-10 text-xs font-semibold transition-all duration-150 cursor-pointer"
              style={{ backgroundColor: tab === "reports" ? c.primary : "transparent", color: tab === "reports" ? "#fff" : c.textMuted }}
              onClick={() => switchTab("reports")}>
              My reports{reports.length > 0 ? ` (${reports.length})` : ""}
            </button>
          </div>

          {tab === "reports" ? (
            <div className="w-full max-w-3xl mx-auto flex-1">
              {reportsLoading ? null : reportsError ? (
                <VCard className="py-20 text-center flex flex-col items-center justify-center">
                  <FileText size={40} className="mb-4" style={{ color: c.textLight }} />
                  <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load reports</p>
                  <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{reportsError}</p>
                  <VButton variant="secondary" onClick={() => { const t = localStorage.getItem("token"); if (t) void loadReports(t); }}>
                    <RefreshCw size={14} /> Try again
                  </VButton>
                </VCard>
              ) : reports.length === 0 ? (
                <VCard className="py-20 text-center flex flex-col items-center justify-center">
                  <FileText size={40} className="mb-4" style={{ color: c.textLight }} />
                  <p className="text-base font-medium" style={{ color: c.textMuted }}>No reports yet</p>
                  <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>
                    Report a lost item or hand in something you found.
                  </p>
                  <VButton onClick={() => switchTab("new")}><Plus size={14} /> New report</VButton>
                </VCard>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => {
                    const Icon = categoryIcons[report.category] || FileText;
                    const verifiedWithItem = report.status === "VERIFIED" && !!report.item;
                    const matchedWithItem = report.status === "MATCHED" && !!report.item;
                    // Verified and matched reports share the compact "item first"
                    // layout; only the thumbnail source differs.
                    const showsItemFirst = verifiedWithItem || matchedWithItem;
                    // Matched cards show the student's uploaded lost-report photo;
                    // the inventory photos remain in the Matched item view.
                    const itemThumb = matchedWithItem
                      ? report.images[0] || report.item?.imageUrl
                      : report.item?.imageUrl;
                    const itemBlock = report.item && (
                          <div className="rounded-xl p-3.5 mb-3 flex flex-wrap items-center gap-3" style={{ backgroundColor: c.fill }}>
                            <button
                              type="button"
                              aria-label={matchedWithItem ? `View your ${report.itemName} photos` : `View ${report.item.name} details`}
                              className="group flex flex-1 min-w-[200px] items-center gap-3 text-left cursor-pointer"
                              onClick={() => {
                                if (matchedWithItem && report.images.length) {
                                  setViewer({ photos: report.images, index: 0, title: report.itemName });
                                } else if (matchedWithItem) {
                                  openReportDetail(report);
                                } else {
                                  void openItemDetail(report);
                                }
                              }}>
                              {itemThumb ? (
                                <span className="relative rounded-lg overflow-hidden border shrink-0 block" style={{ borderColor: c.border }}>
                                  <img src={itemThumb} alt={report.item.name} className="w-12 h-12 object-cover" />
                                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors duration-200 flex items-center justify-center">
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white">
                                      <ZoomIn size={14} />
                                    </span>
                                  </span>
                                </span>
                              ) : (
                                <span className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: c.borderLight }}>
                                  <PackageCheck size={20} style={{ color: c.primary }} />
                                </span>
                              )}
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-semibold" style={{ color: c.text }}>
                                  {matchedWithItem
                                    ? `Lost reporting: ${report.itemName}`
                                    : `${report.type === "LOST" ? "Matched item" : "Logged item"}: ${report.item.name}`}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {(report.status === "VERIFIED" || report.status === "MATCHED") && (
                                    <VBadge color={TYPE_TAG_COLOR}>{report.typeLabel}</VBadge>
                                  )}
                                  {report.status === "VERIFIED" || report.status === "MATCHED" ? (
                                    <VBadge color={report.color}>{report.statusLabel}</VBadge>
                                  ) : (
                                    <span className="text-[11px]" style={{ color: c.textMuted }}>
                                      {itemStatusLabel[report.item.status] || report.item.status}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                            {matchedWithItem && (
                              <VButton variant="secondary" size="sm" onClick={() => void openItemDetail(report)}>
                                <PackageCheck size={13} /> Matched item
                              </VButton>
                            )}
                            <VButton variant="secondary" size="sm" onClick={() => (matchedWithItem ? openReportDetail(report) : void openItemDetail(report))}>
                              <Eye size={13} /> View
                            </VButton>
                          </div>
                    );
                    return (
                      <VCard key={report.id} className="p-5 lg:p-6">
                        {showsItemFirst && itemBlock}
                        {!showsItemFirst && (
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 -mt-1"
                              style={{ backgroundColor: c.primary }}>
                              <Icon size={20} style={{ color: "#fff" }} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{report.itemName}</h3>
                              <p className="text-[11px] mt-0.5" style={{ color: c.textLight }}>
                                {fmtReportDate(report.date)}{" · "}{report.location || "—"}{" · "}{report.category}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <VBadge color={TYPE_TAG_COLOR}>{report.typeLabel}</VBadge>
                            {/* A verified report shows its badge on the logged item below, so hide the duplicate here. */}
                            {!showsItemFirst && (
                              <VBadge color={report.color}>{report.statusLabel}</VBadge>
                            )}
                          </div>
                        </div>
                        )}
                        {/* The details popup already shows the description for verified reports. */}
                        {!showsItemFirst && (
                          <div className="rounded-xl border p-3 mb-3" style={{ borderColor: c.borderLight, backgroundColor: c.fill }}>
                            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: c.textLight }}>Description</p>
                            <p className="text-sm leading-relaxed" style={{ color: c.textMuted }}>{report.description}</p>
                          </div>
                        )}

                        {/* Once verified, the logged item block below holds the only photo. */}
                        {report.images.length > 0 && !showsItemFirst && (
                          <div className={`grid gap-2 mb-3 ${report.images.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
                            {report.images.map((src, index) => (
                              <button key={`${report.id}-photo-${index}`} type="button"
                                aria-label={`View photo ${index + 1}`}
                                className="group relative rounded-xl overflow-hidden border cursor-pointer bg-[#f8fafc]"
                                style={{ borderColor: c.border }}
                                onClick={() => setViewer({ photos: report.images, index, title: report.itemName })}>
                                <img src={src} alt={`${report.itemName} photo ${index + 1}`}
                                  className={`w-full object-cover ${report.images.length === 1 ? "h-40" : "h-28"}`} />
                                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                                  <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                                    <ZoomIn size={13} /> View photo
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        {report.adminNote && (
                          <div className="rounded-xl p-3 mb-3 text-xs" style={{ backgroundColor: "#fef2f2", color: c.danger }}>
                            <span className="font-semibold">Admin note: </span>{report.adminNote}
                          </div>
                        )}

                        {(showsItemFirst || matchedWithItem) && report.reviewedAt && (
                          <p className="text-[11px] text-right mt-3" style={{ color: c.textLight }}>
                            {report.status === "MATCHED" ? "Matched" : "Verified"} by admin · {fmtReportTime(report.reviewedAt)}
                          </p>
                        )}

                        {!showsItemFirst && itemBlock}


                        {report.type === "FOUND" && report.status === "PENDING" && (
                          <div className="rounded-xl p-3.5 mb-3 text-xs leading-relaxed flex gap-2" style={{ backgroundColor: `${c.accent}12`, color: c.textMuted }}>
                            <PackageCheck size={16} className="shrink-0 mt-0.5" style={{ color: c.accent }} />
                            <span>Please hand this item to the Lost &amp; Found office. An admin will verify it and assign a locker.</span>
                          </div>
                        )}

                        {report.status === "PENDING" && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <VButton variant="secondary" size="sm" onClick={() => openEdit(report)}>
                              Edit
                            </VButton>
                            <VButton variant="danger" size="sm" onClick={() => setWithdrawTarget(report)}>
                              Withdraw
                            </VButton>
                          </div>
                        )}
                      </VCard>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col">
              {submitted ? (
                <VCard className="p-10 lg:p-12 text-center flex-1 flex flex-col items-center justify-center">
                  <CheckCircle2 size={56} className="mb-5" style={{ color: c.accent }} />
                  <h2 className="text-2xl font-bold mb-2" style={{ color: c.text }}>
                    {submitted === "LOST" ? "Lost Report Submitted" : "Found Report Submitted"}
                  </h2>
                  <p className="text-base mb-4 max-w-lg" style={{ color: c.textMuted }}>
                    {submitted === "LOST"
                      ? "We'll notify you if a matching item is found. You can track the status under My reports."
                      : "Please hand the item to the Lost & Found office so it can be verified and stored in a locker."}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <VButton variant="secondary" size="lg" onClick={() => { setSubmitted(null); resetForm(); }}>
                      Report another
                    </VButton>
                    <VButton size="lg" onClick={() => { setSubmitted(null); switchTab("reports"); }}>
                      View my reports
                    </VButton>
                  </div>
                </VCard>
              ) : !type ? (
                <div className="flex-1 flex flex-col justify-center py-8">
                  <div className="text-center mb-8">
                    <h2 className="text-xl font-bold mb-2" style={{ color: c.text }}>What would you like to report?</h2>
                    <p className="text-sm" style={{ color: c.textMuted }}>Choose the type of report to continue.</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-5">
                    <button type="button" onClick={() => selectType("LOST")}
                      className="group flex h-full flex-col text-left p-6 lg:p-8 rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg cursor-pointer"
                      style={{ borderColor: c.border }}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${c.primary}15` }}>
                        <PackageSearch size={24} style={{ color: c.primary }} />
                      </div>
                      <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Lost Item</h3>
                      <p className="text-sm mb-5" style={{ color: c.textMuted }}>I lost something on campus and need help finding it.</p>
                      <span className="mt-auto inline-flex items-center justify-center h-9 px-4 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: c.primary }}>
                        Report Lost Item
                      </span>
                    </button>
                    <button type="button" onClick={() => selectType("FOUND")}
                      className="group flex h-full flex-col text-left p-6 lg:p-8 rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg cursor-pointer"
                      style={{ borderColor: c.border }}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${c.accent}18` }}>
                        <PackageCheck size={24} style={{ color: c.accent }} />
                      </div>
                      <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Found Item</h3>
                      <p className="text-sm mb-5" style={{ color: c.textMuted }}>I found an item and want to hand it in.</p>
                      <span className="mt-auto inline-flex items-center justify-center h-9 px-4 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: c.accent }}>
                        Report Found Item
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <VCard className="p-8 lg:p-10 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-xl lg:text-2xl font-bold tracking-tight" style={{ color: c.text }}>
                      Reporting: <span style={{ color: TYPE_TAG_COLOR }}>{type === "LOST" ? "Lost Item" : "Found Item"}</span>
                    </p>
                    <button type="button" className="text-xs font-semibold underline hover:opacity-70 cursor-pointer" style={{ color: c.primary }}
                      onClick={() => { setType(null); resetForm(); }}>
                      Change
                    </button>
                  </div>

                  {type === "FOUND" && (
                    <div className="rounded-xl p-3.5 mb-5 text-xs leading-relaxed flex gap-2" style={{ backgroundColor: `${c.accent}12`, color: c.textMuted }}>
                      <PackageCheck size={16} className="shrink-0 mt-0.5" style={{ color: c.accent }} />
                      <span>After submitting, hand the item to the Lost &amp; Found office. An admin will verify it and assign a locker.</span>
                    </div>
                  )}

                  <div className="mb-5">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                          Item name <span style={{ color: c.danger }}>*</span>
                        </label>
                        <VInput value={itemName} maxLength={100} onChange={(e) => setItemName(e.target.value)}
                          placeholder={type === "LOST" ? "e.g. Black Adidas backpack" : "e.g. Silver Samsung phone"} />
                        {itemName.trim() && startsWithNumber(itemName) && (
                          <p className="text-[11px] mt-1" style={{ color: c.danger }}>Item name cannot start with a number.</p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                            Category <span style={{ color: c.danger }}>*</span>
                          </label>
                          <VDropdown open={categoryOpen} onOpenChange={setCategoryOpen} width="w-full"
                            trigger={
                              <button type="button"
                                className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm border bg-white text-left cursor-pointer relative"
                                style={{ borderColor: c.border, color: category ? c.text : c.textMuted, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                                onClick={() => setCategoryOpen(!categoryOpen)}>
                                {category
                                  ? <>{(() => { const Icon = categoryIcons[category] || Grid3X3; return <Icon size={15} style={{ color: c.primary }} />; })()}<span>{category}</span></>
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
                        </div>
                        <div className="relative">
                          <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                            {type === "LOST" ? "Date lost" : "Date found"} <span style={{ color: c.danger }}>*</span>
                          </label>
                          <VFilterButton
                            className="w-full justify-between"
                            style={{ height: 44, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                            onClick={(e) => { setDateAnchor(e.currentTarget); toggleDateCalendar(); }}>
                            <span className="flex items-center gap-1.5 min-w-0">
                              <Clock size={14} style={{ color: c.primary }} />
                              <span className="truncate">{date ? fmtDay(date) : "Select date"}</span>
                            </span>
                            <ChevronDown size={13} style={{ color: c.textMuted }} />
                          </VFilterButton>

                          {dateOpen && (
                            <CalendarPopover anchor={dateAnchor} value={date}
                              onChange={setDate} onClose={() => setDateOpen(false)} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                          {type === "LOST" ? "Last seen location" : "Found location"} <span style={{ color: c.danger }}>*</span>
                        </label>
                        <VInput value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Library 3rd Floor" />
                        {location.trim() && startsWithNumber(location) && (
                          <p className="text-[11px] mt-1" style={{ color: c.danger }}>Location cannot start with a number.</p>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                          Description <span style={{ color: c.danger }}>*</span>
                        </label>
                        <VTextarea value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} rows={3}
                          placeholder="Provide details like color, brand and distinguishing features..." />
                        {description.trim() && startsWithNumber(description) && (
                          <p className="text-[11px] mt-1" style={{ color: c.danger }}>Description cannot start with a number.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: c.textMuted }}>
                        Photo <span className="font-normal normal-case tracking-normal" style={{ color: c.textLight }}>(optional · up to 3 photos)</span>
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
                                className={`w-full object-cover ${photos.length === 1 ? "h-40" : "h-28"}`} />
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
                    <p className="text-[11px] mt-2" style={{ color: c.textLight }}>JPG or PNG · up to 5MB each</p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t mt-auto" style={{ borderColor: c.borderLight }}>
                    <VButton variant="secondary" size="lg" onClick={() => { setType(null); resetForm(); }}>Cancel</VButton>
                    <VButton size="lg" onClick={handleSubmit} disabled={!formValid || submitting}>
                      {submitting && <Loader2 size={15} className="animate-spin" />}
                      {submitting ? "Submitting..." : "Submit"}
                    </VButton>
                  </div>
                </VCard>
              )}
            </div>
          )}
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
          onPhotoIndexChange={(index) => setItemDetail((prev) => (prev ? { ...prev, imageIndex: index } : prev))}
          onViewPhoto={() => setViewer({ photos: itemDetail.images, index: itemDetail.imageIndex, title: itemDetail.name })}
          onClose={() => setItemDetail(null)}
          footer={<VButton variant="secondary" className="flex-1" onClick={() => setItemDetail(null)}>Close</VButton>}
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
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!savingEdit) setEditTarget(null); }} />
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

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Item name</label>
                <VInput value={editForm.itemName} maxLength={100}
                  onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })} />
                {editForm.itemName.trim() && startsWithNumber(editForm.itemName) && (
                  <p className="text-[11px] mt-1" style={{ color: c.danger }}>Item name cannot start with a number.</p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Category</label>
                  <VDropdown open={editCategoryOpen} onOpenChange={setEditCategoryOpen} width="w-full"
                    trigger={
                      <button type="button"
                        className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm border bg-white text-left cursor-pointer relative"
                        style={{ borderColor: c.border, color: editForm.category ? c.text : c.textMuted, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                        onClick={() => setEditCategoryOpen(!editCategoryOpen)}>
                        {editForm.category
                          ? <>{(() => { const Icon = categoryIcons[editForm.category] || Grid3X3; return <Icon size={15} style={{ color: c.primary }} />; })()}<span>{editForm.category}</span></>
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
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Date</label>
                  <VFilterButton className="w-full justify-between" style={{ height: 44, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                    onClick={(e) => { setEditDateAnchor(e.currentTarget); setEditDateOpen((open) => !open); }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Clock size={14} style={{ color: c.primary }} />
                      <span className="truncate">{editForm.date ? fmtDay(editForm.date) : "Select date"}</span>
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
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Location</label>
                <VInput value={editForm.location} maxLength={200}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                {editForm.location.trim() && startsWithNumber(editForm.location) && (
                  <p className="text-[11px] mt-1" style={{ color: c.danger }}>Location cannot start with a number.</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>Description</label>
                <VTextarea rows={4} value={editForm.description} maxLength={2000}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                {editForm.description.trim() && startsWithNumber(editForm.description) && (
                  <p className="text-[11px] mt-1" style={{ color: c.danger }}>Description cannot start with a number.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="text-xs font-semibold" style={{ color: c.text }}>
                    Photos <span className="font-normal" style={{ color: c.textLight }}>({editPhotos.length}/3 · max 3)</span>
                  </label>
                  {editPhotos.length > 0 && editPhotos.length < 3 && (
                    <button type="button" onClick={() => setPhotoSourceTarget("edit")}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white cursor-pointer"
                      style={{ borderColor: c.border, color: c.primary }}>
                      <Plus size={13} /> Add photo
                    </button>
                  )}
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
                            className={`w-full object-cover ${editPhotos.length === 1 ? "h-32" : "h-20"}`} />
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
                <p className="text-[11px] mt-1" style={{ color: c.textLight }}>JPG or PNG · up to 5MB each</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t" style={{ borderColor: c.borderLight }}>
              <VButton variant="secondary" onClick={() => { if (!savingEdit) setEditTarget(null); }}>Cancel</VButton>
              <VButton onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {savingEdit ? "Saving..." : "Save changes"}
              </VButton>
            </div>
          </VCard>
        </div>
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
    </StudentShell>
  );
}
