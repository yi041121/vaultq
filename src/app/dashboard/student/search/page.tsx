"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FileText, QrCode, Package,
  Briefcase, CreditCard, Key, BookText, CupSoda,
  ChevronDown, Home, PlusCircle, BellRing, User,
  Monitor, Grid3X3, ArrowUpDown,
  MapPin, Clock, ChevronLeft, ChevronRight, RotateCcw, Camera, X, Upload, Eye
} from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VBadge, VFilterButton, VPagination, VDropdown, VDropdownItem, VSearchInput, VButton, VTextarea,
  vcolors as c, font as f
} from "@/components/ui/vault";

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

const items = [
  { id: 1, name: "MacBook Pro 14\"", category: "Electronics", type: "found", location: "Library 3rd Floor", date: "2026-07-24", status: "Found", color: "#7FB8B5", description: "Space Gray, M3 chip, 16GB RAM. Found on table near window with black sleeve. Has small dent on lid and Apple sticker." },
  { id: 2, name: "Brown Leather Wallet", category: "Bags", type: "found", location: "Student Lounge", date: "2026-07-23", status: "Found", color: "#7FB8B5", description: "Brown leather bifold wallet with zip compartment. Contains IC and student card inside. Found on sofa." },
  { id: 3, name: "AirPods Pro", category: "Electronics", type: "lost", location: "Sports Complex", date: "2026-07-22", status: "Lost", color: "#355C8A", description: "White AirPods Pro 2nd gen with MagSafe case. Left side has scratch. Lost during basketball session." },
  { id: 4, name: "Student ID Card", category: "Student Cards", type: "found", location: "Cafeteria", date: "2026-07-21", status: "Found", color: "#7FB8B5", description: "Student ID for Faculty of Computing, matric 2000132602, photo matches holder. Found near counter." },
  { id: 5, name: "Casio G-Shock Watch", category: "Electronics", type: "lost", location: "Main Hall", date: "2026-07-20", status: "Lost", color: "#355C8A", description: "Black Casio G-Shock DW5600, black resin strap, slight scratch on glass." },
  { id: 6, name: "Blue Water Bottle", category: "Water Bottles", type: "found", location: "Gymnasium", date: "2026-07-19", status: "Found", color: "#7FB8B5", description: "Blue Hydro Flask 500ml with white cap, has sticker of university logo." },
  { id: 7, name: "House Keys (4 pcs)", category: "Keys", type: "lost", location: "Bus Stop", date: "2026-07-18", status: "Lost", color: "#355C8A", description: "4 silver keys on blue keychain with VaultQ tag." },
  { id: 8, name: "Physics Notes Folder", category: "Documents", type: "found", location: "Lecture Hall B", date: "2026-07-17", status: "Found", color: "#7FB8B5", description: "Blue folder with handwritten physics notes, labeled 'Semester 2'." },
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

export default function StudentSearch() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
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

  const [viewItem, setViewItem] = useState<typeof items[0] | null>(null);

  // Claim modal state
  const [claimItem, setClaimItem] = useState<typeof items[0] | null>(null);
  const [claimReason, setClaimReason] = useState("");
  const [claimPhoto, setClaimPhoto] = useState<File | null>(null);
  const [claimPreview, setClaimPreview] = useState<string | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
      return;
    }
    setUser(JSON.parse(stored));
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out");
    router.push("/login?skip=1");
  }

  const filtered = items
    .filter((item) => {
      if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (searchType !== "all" && item.type !== searchType) return false;
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

  function openClaim(item: typeof items[0]) {
    if (item.type !== "found") {
      router.push("/dashboard/student/report?type=lost");
      return;
    }
    setViewItem(null);
    setClaimItem(item);
    setClaimReason("");
    setClaimPhoto(null);
    setClaimPreview(null);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setClaimPhoto(file);
    const reader = new FileReader();
    reader.onload = () => setClaimPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmitClaim() {
    if (!claimItem) return;
    if (!claimReason.trim()) {
      toast.error("Please describe why this item is yours");
      return;
    }
    if (!claimPhoto) {
      toast.error("Please upload photo evidence");
      return;
    }
    setClaimSubmitting(true);
    const existing = JSON.parse(localStorage.getItem("vaultq_claims") || "[]");
    const newClaim = {
      id: `CLM-${Date.now()}`,
      itemId: claimItem.id,
      itemName: claimItem.name,
      category: claimItem.category,
      location: claimItem.location,
      date: claimItem.date,
      reason: claimReason.trim(),
      evidencePreview: claimPreview,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("vaultq_claims", JSON.stringify([...existing, newClaim]));
    try {
      const token = localStorage.getItem("token");
      const form = new FormData();
      form.append("itemId", String(claimItem.id));
      form.append("claimReason", claimReason.trim());
      if (claimPhoto) form.append("evidence", claimPhoto);
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error) {
        console.warn("API claim failed, using local mock:", data.error);
      }
    } catch (e) {
      console.warn("Claim API not reachable, using local mock");
    }
    setTimeout(() => {
      setClaimSubmitting(false);
      setClaimItem(null);
      toast.success("Claim submitted with evidence — awaiting verification");
    }, 600);
  }

  if (!user || !mounted) return null;

  const hasFilters = !!(query || searchType !== "all" || selectedCategory || dateFrom);

  return (
    <StudentShell active="Search" userName={user.name} userRole={user.role} pageTitle="Search Items" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="flex-1 min-w-[220px] max-w-xl" />
            <div className="flex h-10 rounded-xl border bg-white overflow-hidden shrink-0" style={{ borderColor: c.border }}>
              {["all", "lost", "found"].map((t) => (
                <button key={t} type="button"
                  className="px-3 text-sm font-medium transition-all duration-150 cursor-pointer"
                  style={{
                    backgroundColor: searchType === t ? c.primary : "transparent",
                    color: searchType === t ? "#fff" : c.textMuted,
                  }}
                  onClick={() => { setSearchType(t); setPage(1); }}>
                  {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
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
                onClick={() => {
                  setQuery("");
                  setSearchType("all");
                  setSelectedCategory(null);
                  setDateFrom("");
                  setDateTo("");
                  setSortOrder("newest");
                  setPage(1);
                  setCalOffset(0);
                  setSortOpen(false);
                  setCategoryOpen(false);
                  setDateRangeOpen(false);
                }}>
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Items grid */}
          {filtered.length === 0 ? (
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
                  return (
                    <VCard key={item.id} className="p-5 flex flex-col transition-all duration-200 hover:shadow-lg" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                      <div className="w-full h-40 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden cursor-pointer"
                        style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}
                        onClick={() => setViewItem(item)}>
                        <div className="absolute inset-0 opacity-40"
                          style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                        <Icon size={40} style={{ color: c.primary, opacity: 0.6 }} />
                      </div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold truncate cursor-pointer hover:opacity-80" style={{ color: c.text }} onClick={() => setViewItem(item)}>{item.name}</h3>
                        <VBadge color={item.color}>{item.status}</VBadge>
                      </div>
                      <p className="text-xs flex items-center gap-1" style={{ color: c.textMuted }}>
                        <MapPin size={12} style={{ color: c.textMuted }} /> {item.location}
                      </p>
                      <p className="text-xs flex items-center gap-1 mt-1" style={{ color: c.textMuted }}>
                        <Clock size={12} style={{ color: c.textLight }} /> {new Date(item.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      <div className="flex items-center gap-2 mt-4">
                        <button type="button"
                          className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                          style={{ borderColor: c.border, color: c.textMuted }}
                          onClick={() => setViewItem(item)}>
                          <Eye size={13} /> View Details
                        </button>
                        <button type="button"
                          className="flex-1 h-9 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer"
                          style={{ backgroundColor: c.primary, color: "#fff", boxShadow: "0 2px 6px rgba(53,92,138,0.25)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.primaryDark; e.currentTarget.style.boxShadow = "0 3px 10px rgba(41,72,106,0.3)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.primary; e.currentTarget.style.boxShadow = "0 2px 6px rgba(53,92,138,0.25)"; }}
                          onClick={() => openClaim(item)}>
                          {item.type === "found" ? "Claim" : "Report"}
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

      {/* Item details modal — shows description before claim */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setViewItem(null)} />
          <VCard className="relative w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="w-full h-48 rounded-t-2xl flex items-center justify-center relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}>
              <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
              {(() => { const Icon = filterIcons[viewItem.category] || Package; return <Icon size={48} style={{ color: c.primary, opacity: 0.6 }} />; })()}
              <button type="button" onClick={() => setViewItem(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-base font-semibold" style={{ color: c.text }}>{viewItem.name}</h3>
                <VBadge color={viewItem.color}>{viewItem.status}</VBadge>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: c.borderLight, color: c.textMuted }}>{viewItem.category}</span>
                <span className="text-xs flex items-center gap-1" style={{ color: c.textMuted }}><MapPin size={12} /> {viewItem.location}</span>
                <span className="text-xs flex items-center gap-1" style={{ color: c.textMuted }}><Clock size={12} /> {new Date(viewItem.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: c.fill }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>Description</p>
                <p className="text-sm leading-relaxed" style={{ color: c.textMuted }}>{viewItem.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <VButton variant="secondary" className="flex-1" onClick={() => setViewItem(null)}>Close</VButton>
                {viewItem.type === "found" && (
                  <VButton className="flex-1" onClick={() => openClaim(viewItem)}>Claim this item</VButton>
                )}
              </div>
            </div>
          </VCard>
        </div>
      )}

      {/* Claim evidence modal */}
      {claimItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setClaimItem(null)} />
          <VCard className="relative w-full max-w-lg p-6 lg:p-7 max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Claim Item</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{claimItem.name} · {claimItem.category} · {claimItem.location}</p>
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
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Photo Evidence <span style={{ color: c.danger }}>*</span></label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                {claimPreview ? (
                  <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                    <img src={claimPreview} alt="Evidence preview" className="w-full h-48 object-cover" />
                    <button type="button" onClick={() => { setClaimPhoto(null); setClaimPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors duration-200 cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                    style={{ borderColor: c.border, color: c.textMuted, backgroundColor: c.fill }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; e.currentTarget.style.color = c.primary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textMuted; }}>
                    <Camera size={22} />
                    <span className="text-xs font-medium">Upload photo evidence</span>
                    <span className="text-[11px]" style={{ color: c.textLight }}>JPG, PNG up to 5MB — required</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <VButton variant="secondary" onClick={() => setClaimItem(null)}>Cancel</VButton>
                <VButton onClick={handleSubmitClaim} disabled={claimSubmitting || !claimReason.trim() || !claimPhoto}>
                  <Upload size={14} /> {claimSubmitting ? "Submitting..." : "Submit Claim"}
                </VButton>
              </div>
              <p className="text-[11px] text-center" style={{ color: c.textLight }}>Admin will verify your description + photo before approval. False claims may be rejected.</p>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
