"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Package,
  Briefcase, CreditCard, Key, BookText, CupSoda,
  ChevronDown, Monitor, Grid3X3, ArrowUpDown,
  MapPin, Clock, ChevronLeft, ChevronRight, RotateCcw, Camera, X, Upload, Eye, Crop,
  Loader2, RefreshCw, CheckCircle2, Plus,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { StudentShell } from "@/components/student-shell";
import { PhotoPicker } from "@/components/photo-picker";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { CameraCaptureModal } from "@/components/camera-capture-modal";
import { PhotoSourceDialog } from "@/components/photo-source-dialog";
import {
  VCard, VBadge, VFilterButton, VPagination, VDropdown, VDropdownItem, VSearchInput, VButton, VTextarea,
  vcolors as c,
} from "@/components/ui/vault";
import { mapApiItem, type FoundItem } from "@/lib/item-mapper";
import { matchesSearch, dateSearchValues } from "@/lib/search";

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

const filterIcons: Record<string, any> = {
  Electronics: Monitor,
  Bags: Briefcase,
  "Student Cards": CreditCard,
  Keys: Key,
  Documents: BookText,
  "Water Bottles": CupSoda,
  Others: Grid3X3,
};

let searchItemsCache: FoundItem[] | null = null;

export default function StudentSearch() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  const [items, setItems] = useState<FoundItem[]>(searchItemsCache ?? []);
  const [loading, setLoading] = useState(searchItemsCache === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimedItemIds, setClaimedItemIds] = useState<Set<string>>(new Set());

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
  const [claimPhotos, setClaimPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [claimCameraOpen, setClaimCameraOpen] = useState(false);
  const [claimPhotoSourceOpen, setClaimPhotoSourceOpen] = useState(false);
  const [claimEditPhoto, setClaimEditPhoto] = useState<number | null>(null);
  const claimCameraRef = useRef<HTMLInputElement>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const deepLinkHandled = useRef(false);

  async function loadData(token: string) {
    if (!searchItemsCache) setLoading(true);
    setLoadError(null);
    try {
      const [itemsRes, claimsRes] = await Promise.all([
        fetch("/api/items", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/api/claims", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      const itemsJson = await itemsRes.json().catch(() => null);
      if (!itemsRes.ok || !itemsJson?.success) {
        throw new Error(itemsJson?.error || "Failed to load items");
      }
      const mapped = (itemsJson.data as any[]).map(mapApiItem);
      setItems(mapped);
      searchItemsCache = mapped;

      // A match notification deep-links to /search?item=<id>. Open that item
      // once the list has loaded, then drop the query string.
      if (!deepLinkHandled.current) {
        deepLinkHandled.current = true;
        const targetId = new URLSearchParams(window.location.search).get("item");
        if (targetId) {
          window.history.replaceState(null, "", "/dashboard/student/search");
          const target = mapped.find((item) => item.id === targetId);
          if (target) {
            setViewItem(target);
          } else {
            showCenteredMessage("error", "That item is no longer available");
          }
        }
      }

      // Items this student already has a pending/approved claim for.
      if (claimsRes.ok) {
        const claimsJson = await claimsRes.json().catch(() => null);
        if (claimsJson?.success && Array.isArray(claimsJson.data)) {
          const ids = (claimsJson.data as any[])
            .filter((cl) => cl.status === "PENDING" || cl.status === "APPROVED")
            .map((cl) => cl.itemId as string);
          setClaimedItemIds(new Set(ids));
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load items");
      if (!searchItemsCache) setItems([]);
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
    void loadData(token);
  }, []);

  function handleLogout() {
    searchItemsCache = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  const filtered = items
    .filter((item) => {
      // Items this student handed in never appear in their own search results.
      if (item.reportedByMe) return false;
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

  function fmtDay(d: Date) {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtItemDate(d: string) {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  const baseMonth = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
  const months = [baseMonth, new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1)];

  function isInRange(d: Date) {
    if (!tempFrom || !tempTo) return false;
    return d > parseDate(tempFrom) && d < parseDate(tempTo);
  }

  function openClaim(item: FoundItem) {
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
    setClaimItem(item);
    setClaimReason("");
    setClaimPhotos([]);
    setClaimCameraOpen(false);
    setClaimPhotoSourceOpen(false);
    setClaimEditPhoto(null);
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
            new Promise<{ file: File; preview: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ file, preview: reader.result as string });
              reader.onerror = () => reject(new Error("Could not read image"));
              reader.readAsDataURL(file);
            }),
        ),
      );
      setClaimPhotos((prev) => [...prev, ...drafts].slice(0, 3));
    } catch {
      showCenteredMessage("error", "Could not read one of the images");
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
    if (!claimItem) return;
    if (!claimReason.trim()) {
      showCenteredMessage("error", "Please describe why this item is yours");
      return;
    }
    if (!claimPhotos.length) {
      showCenteredMessage("error", "Please upload photo evidence");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      showCenteredMessage("error", "Session expired — please sign in again");
      return;
    }

    const item = claimItem;
    setClaimSubmitting(true);
    try {
      const form = new FormData();
      form.append("itemId", item.id);
      form.append("claimReason", claimReason.trim());
      claimPhotos.forEach((photo) => form.append("evidence", photo.file));

      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showCenteredMessage("error", data?.error || "Failed to submit claim");
        return;
      }

      setClaimedItemIds((prev) => new Set(prev).add(item.id));
      setClaimItem(null);
      setClaimReason("");
      setClaimPhotos([]);
      setClaimCameraOpen(false);
      setClaimPhotoSourceOpen(false);
      setClaimEditPhoto(null);
      if (fileRef.current) fileRef.current.value = "";
      if (claimCameraRef.current) claimCameraRef.current.value = "";
      showCenteredMessage("success", "Claim submitted with evidence — awaiting verification");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to submit claim");
    } finally {
      setClaimSubmitting(false);
    }
  }

  if (!user || !mounted) return null;

  const hasFilters = !!(query || selectedCategory || dateFrom);

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
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="flex-1 min-w-[220px] max-w-xl" />
            <VDropdown
              open={categoryOpen}
              onOpenChange={setCategoryOpen}
              trigger={
                <VFilterButton active={!!selectedCategory} className="pl-3 pr-8 relative" onClick={() => setCategoryOpen(!categoryOpen)}>
                  {selectedCategory ? (
                    <>{(() => { const cc = categories.find(c => c.label === selectedCategory); return cc ? <cc.icon size={14} style={{ color: cc.color }} /> : null; })()}<span>{selectedCategory}</span></>
                  ) : (
                    <><Grid3X3 size={14} style={{ color: c.textMuted }} /><span>All Categories</span></>
                  )}
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textMuted }} />
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
            <div className="relative shrink-0">
              <VFilterButton active={!!dateFrom}
                onClick={() => { setTempFrom(dateFrom); setTempTo(dateTo); setDateRangeOpen(!dateRangeOpen); }}>
                <Clock size={14} style={{ color: c.primary }} />
                <span className="whitespace-nowrap">
                  {dateFrom && dateTo && dateFrom !== dateTo
                    ? `${fmtDay(parseDate(dateFrom))} - ${fmtDay(parseDate(dateTo))}`
                    : dateFrom && dateTo
                      ? fmtDay(parseDate(dateFrom))
                      : dateFrom
                        ? `${fmtDay(parseDate(dateFrom))} - ?`
                        : "Select date"}
                </span>
                <ChevronDown size={13} className="text-[#64748b]" />
              </VFilterButton>
              {dateRangeOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setDateRangeOpen(false)} />
                  <div className="absolute left-0 top-12 z-30 w-[300px] rounded-2xl border bg-white p-4 shadow-xl" style={{ borderColor: c.border }}>
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
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer"
                        style={{ backgroundColor: c.fill, color: c.textMuted }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.fill; }}
                        onClick={() => setCalOffset(calOffset + 1)}>
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
                        return (
                          <button key={i} type="button"
                            className="h-8 w-8 mx-auto rounded-full text-xs transition-all duration-150 cursor-pointer"
                            style={{
                              backgroundColor: isStart || isEnd ? c.primary : inRange ? c.primarySoft : "transparent",
                              color: isStart || isEnd ? "#fff" : c.text,
                              fontWeight: isStart || isEnd ? "700" : "400",
                            }}
                            onMouseEnter={(e) => { if (!isStart && !isEnd) e.currentTarget.style.backgroundColor = c.fill; }}
                            onMouseLeave={(e) => { if (!isStart && !isEnd) e.currentTarget.style.backgroundColor = inRange ? c.primarySoft : "transparent"; }}
                            onClick={() => {
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
                        onClick={() => { setTempFrom(""); setTempTo(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
                        Clear
                      </button>
                      <button type="button"
                        className="h-8 px-4 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                        style={{ backgroundColor: c.primary, color: "#fff" }}
                        onMouseEnter={(e) => { if (tempFrom) e.currentTarget.style.backgroundColor = c.primaryDark; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.primary; }}
                        onClick={() => {
                          if (!tempFrom) return;
                          setDateFrom(tempFrom);
                          setDateTo(tempTo || tempFrom);
                          setPage(1);
                          setDateRangeOpen(false);
                        }}>
                        Confirm
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <VDropdown
              open={sortOpen}
              onOpenChange={setSortOpen}
              width="w-32"
              trigger={
                <VFilterButton onClick={() => setSortOpen(!sortOpen)}>
                  <ArrowUpDown size={13} style={{ color: c.textMuted }} />
                  <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
                  <ChevronDown size={12} className="text-[#64748b]" />
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
            {hasFilters && (
              <button type="button"
                className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-medium border bg-white transition-all duration-200 cursor-pointer"
                style={{ borderColor: c.borderLight, color: c.primary, fontWeight: "600" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.primarySoft; e.currentTarget.style.borderColor = c.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.borderColor = c.borderLight; }}
                onClick={resetFilters}>
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Items grid */}
          {loading ? null : loadError ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load items</p>
              <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{loadError}</p>
              <VButton variant="secondary" onClick={() => { const t = localStorage.getItem("token"); if (t) void loadData(t); }}>
                <RefreshCw size={14} /> Try again
              </VButton>
            </VCard>
          ) : filtered.length === 0 ? (
            <VCard className="py-20 text-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>No items found</p>
              <p className="text-sm mt-1" style={{ color: c.textMuted }}>Try adjusting your filters or search term.</p>
            </VCard>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 flex-1">
                {paginated.map((item) => {
                  const Icon = filterIcons[item.category] || Package;
                  const claimed = claimedItemIds.has(item.id);
                  const ownReport = item.reportedByMe;
                  const unavailable = claimed || ownReport || item.status !== "FOUND";
                  return (
                    <VCard key={item.id} className="p-5 flex flex-col transition-all duration-200 hover:shadow-lg cursor-pointer" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }} onClick={() => setViewItem(item)}>
                      <div className="w-full h-40 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden cursor-pointer"
                        style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}
                        onClick={() => setViewItem(item)}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <>
                            <div className="absolute inset-0 opacity-40"
                              style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                            <Icon size={40} style={{ color: c.primary, opacity: 0.6 }} />
                          </>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold truncate cursor-pointer hover:opacity-80" style={{ color: c.text }} onClick={() => setViewItem(item)}>{item.name}</h3>
                        <VBadge color={item.color}>{item.statusLabel}</VBadge>
                      </div>
                      <p className="text-xs flex items-center gap-1" style={{ color: c.textMuted }}>
                        <MapPin size={12} style={{ color: c.textMuted }} /> {item.location || "—"}
                      </p>
                      <p className="text-xs flex items-center gap-1 mt-1" style={{ color: c.textMuted }}>
                        <Clock size={12} style={{ color: c.textLight }} /> {fmtItemDate(item.date)}
                      </p>
                      <div className="flex items-center gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
                <span className="text-xs" style={{ color: c.textMuted }}>
                  Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} results
                </span>
                <VPagination current={currentPage} total={totalPages} onPage={setPage} />
              </div>
            </>
          )}
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

      {/* Claim evidence modal */}
      {claimItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setClaimItem(null)} />
          <VCard className="relative w-full max-w-lg p-6 lg:p-7 max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Claim Item</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{claimItem.name} · {claimItem.category} · {claimItem.location || "—"}</p>
              </div>
              <button type="button" onClick={() => setClaimItem(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer shrink-0 ml-3" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Why is this yours? <span style={{ color: c.danger }}>*</span></label>
                <VTextarea value={claimReason} onChange={(e) => setClaimReason(e.target.value)} rows={3}
                  placeholder="Describe distinctive details, proof of ownership..." />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                  Photo Evidence <span style={{ color: c.danger }}>*</span>
                  <span className="font-normal" style={{ color: c.textLight }}> (up to 3 photo)</span>
                </label>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
                <input ref={claimCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
                {claimPhotos.length === 0 ? (
                  <div>
                    <PhotoPicker onUpload={() => fileRef.current?.click()} onTakePhoto={openClaimCamera} />
                    <p className="text-[11px] mt-1.5 text-center" style={{ color: c.textLight }}>JPG, PNG up to 5MB each</p>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-3 gap-2">
                      {claimPhotos.map((photo, index) => (
                        <div key={`${index}-${photo.file.name}`} className="relative group rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                          <button type="button" onClick={() => setClaimEditPhoto(index)}
                            className="block w-full cursor-pointer" aria-label={`View or crop evidence photo ${index + 1}`}>
                            <img src={photo.preview} alt={`Evidence ${index + 1}`}
                              className={`w-full object-cover ${claimPhotos.length === 1 ? "h-40" : "h-24"}`} />
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                                <Crop size={12} /> Crop
                              </span>
                            </span>
                          </button>
                          <button type="button" aria-label={`Remove evidence photo ${index + 1}`}
                            onClick={() => setClaimPhotos((prev) => prev.filter((_, i) => i !== index))}
                            className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors duration-200 cursor-pointer">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-end mt-2">
                      {claimPhotos.length < 3 && (
                        <button type="button" onClick={() => setClaimPhotoSourceOpen(true)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white cursor-pointer"
                          style={{ borderColor: c.border, color: c.primary }}>
                          <Plus size={13} /> Add photo
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <VButton variant="secondary" onClick={() => setClaimItem(null)}>Cancel</VButton>
                <VButton onClick={handleSubmitClaim} disabled={claimSubmitting || !claimReason.trim() || claimPhotos.length === 0}>
                  <Upload size={14} /> {claimSubmitting ? "Submitting..." : "Submit Claim"}
                </VButton>
              </div>
              <p className="text-[11px] text-center" style={{ color: c.textLight }}>Admin will verify your description + photo before approval. False claims may be rejected.</p>
            </div>
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
            setClaimPhotos((prev) => (prev.length >= 3 ? prev : [...prev, { file: photo.file, preview: photo.preview }]));
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
                index === claimEditPhoto ? { file: photo.file, preview: photo.preview } : entry,
              ),
            );
            setClaimEditPhoto(null);
          }}
        />
      )}
    </StudentShell>
  );
}
