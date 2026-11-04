"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Grid3X3, Lock, FileText, Users, Plus, Search, MapPin, Clock,
  Briefcase, CreditCard, Key, BookText, CupSoda, Monitor, ChevronDown,
  ArrowUpDown, RotateCcw, Pencil, Trash2, X, Camera, Upload, PackageSearch,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { useEscapeKey } from "@/lib/use-escape-key";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VBadge, VButton, VInput, VTextarea, VDropdown, VDropdownItem, VSearchInput, VPagination, VFilterButton,
  vcolors as c,
} from "@/components/ui/vault";

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Reports", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

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

const statusOptions = ["All", "FOUND", "CLAIMED", "RETRIEVED", "EXPIRED"] as const;

type Item = {
  id: string;
  name: string;
  category: string;
  location: string;
  date: string;
  status: typeof statusOptions[number];
  locker?: string;
};

function statusColor(s: string) {
  switch (s) {
    case "FOUND": return "#7FB8B5";
    case "CLAIMED": return "#355C8A";
    case "RETRIEVED": return "#16a34a";
    case "EXPIRED": return "#64748b";
    default: return "#7FB8B5";
  }
}

let itemsCache: Item[] | null = null;

export default function AdminItems() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<Item[]>(itemsCache ?? []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<typeof statusOptions[number]>("All");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<string | null>(null);
  const [formLocation, setFormLocation] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formLocker, setFormLocker] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCatOpen, setFormCatOpen] = useState(false);
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [loading, setLoading] = useState(itemsCache === null);
  const [lockerMap, setLockerMap] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function authHeaders(): Record<string, string> {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function mapApiItem(raw: any): Item {
    return {
      id: raw.id,
      name: raw.itemName,
      category: raw.category || "Others",
      location: raw.foundLocation || "",
      date: (raw.foundDate || raw.createdAt || "").slice(0, 10),
      status: raw.status,
      locker: raw.locker?.lockerNumber,
    };
  }

  async function fetchItems() {
    if (!itemsCache) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/items", { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load items");
      const list = (data.data || []).map(mapApiItem);
      setItems(list);
      itemsCache = list;
    } catch (e: any) {
      if (!itemsCache) setItems([]);
      setLoadError(e?.message || "Failed to load items");
    } finally {
      setLoading(false);
    }
  }

  async function fetchLockers() {
    try {
      const res = await fetch("/api/lockers", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const map: Record<string, string> = {};
      for (const l of data.data || []) map[String(l.lockerNumber).toUpperCase()] = l.id;
      setLockerMap(map);
    } catch {
      // Locker lookup optional — save will warn if locker unknown
    }
  }

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
    fetchItems();
    fetchLockers();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (q) setQuery(q);
      const add = params.get("add");
      if (add === "1") {
        setEditing(null);
        setFormName(""); setFormCategory(null); setFormLocation(""); setFormDate(new Date().toISOString().slice(0, 10)); setFormLocker(""); setFormDesc(""); setFormPhoto(null); setFormPreview(null);
        setShowModal(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/login?skip=1&loggedOut=1"); }
  useEscapeKey(showModal, () => { if (!saving) setShowModal(false); }, !saving);
  useEscapeKey(!!deleteTarget, () => setDeleteTarget(null));

  if (!user || !mounted) return null;

  const today = new Date().toISOString().slice(0, 10);

  const filtered = items
    .filter((it) => {
      if (query && !it.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (statusFilter !== "All" && it.status !== statusFilter) return false;
      if (categoryFilter && it.category !== categoryFilter) return false;
      return true;
    })
    .sort((a, b) => (sortOrder === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = !!(query || statusFilter !== "All" || categoryFilter);

  function openAdd() {
    setEditing(null);
    setFormName(""); setFormCategory(null); setFormLocation(""); setFormDate(today); setFormLocker(""); setFormDesc(""); setFormPhoto(null); setFormPreview(null);
    setShowModal(true);
  }
  function openEdit(it: Item) {
    setEditing(it);
    setFormName(it.name); setFormCategory(it.category); setFormLocation(it.location); setFormDate(it.date); setFormLocker(it.locker || ""); setFormDesc(""); setFormPhoto(null); setFormPreview(null);
    setShowModal(true);
  }
  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showCenteredMessage("error", "Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showCenteredMessage("error", "Image must be under 5MB");
      return;
    }
    setFormPhoto(file);
    const reader = new FileReader();
    reader.onload = () => setFormPreview(reader.result as string);
    reader.readAsDataURL(file);
  }
  function clearPhoto() {
    setFormPhoto(null);
    setFormPreview(null);
    if (uploadRef.current) uploadRef.current.value = "";
  }
  async function openLiveCamera() {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      liveStreamRef.current = stream;
      // wait for video element
      setTimeout(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      showCenteredMessage("error", "Cannot open camera — use Upload or Take Photo instead");
      setShowCamera(false);
    }
  }
  function closeLiveCamera() {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    setShowCamera(false);
  }
  function captureLivePhoto() {
    const video = liveVideoRef.current;
    if (!video || video.readyState < 2) {
      showCenteredMessage("error", "Camera not ready yet");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `item-${Date.now()}.jpg`, { type: "image/jpeg" });
      setFormPhoto(file);
      setFormPreview(URL.createObjectURL(blob));
      showCenteredMessage("success", "Photo captured");
      closeLiveCamera();
    }, "image/jpeg", 0.9);
  }
  async function handleSave() {
    if (!formName.trim() || !formCategory || !formLocation.trim() || !formDate) {
      showCenteredMessage("error", "Please fill required fields");
      return;
    }
    // Resolve locker number (e.g. "A12") to locker id for the API
    let lockerId: string | null = null;
    const lockerNum = formLocker.trim().toUpperCase();
    if (lockerNum) {
      lockerId = lockerMap[lockerNum] || null;
      if (!lockerId) {
        showCenteredMessage("error", `Locker ${formLocker.trim()} not found`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: any = {
        itemName: formName.trim(),
        category: formCategory,
        description: formDesc.trim() || null,
        foundLocation: formLocation.trim(),
        foundDate: formDate,
      };
      // Send photo preview as imageUrl (data URL) when a new photo was chosen
      if (formPreview && formPreview.startsWith("data:")) payload.imageUrl = formPreview;
      if (!editing) {
        if (lockerId) payload.lockerId = lockerId;
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to add item");
        showCenteredMessage("success", "Item added");
      } else {
        if (formLocker.trim()) payload.lockerId = lockerId;
        else if (!formLocker.trim() && editing.locker) payload.lockerId = null;
        const res = await fetch(`/api/items/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to update item");
        showCenteredMessage("success", "Item updated");
      }
      setShowModal(false);
      await fetchItems();
      await fetchLockers();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openDelete(it: Item) {
    setDeleteTarget(it);
  }
  function closeDelete() {
    setDeleteTarget(null);
  }
  async function confirmDeleteFinal() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/items/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete item");
      showCenteredMessage("success", `Item ${deleteTarget.id} removed`);
      closeDelete();
      await fetchItems();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Delete failed");
    }
  }

  return (
    <StudentShell active="Items" userName={user.name} userRole={user.role} pageTitle="Item Inventory" bottomNav={adminNav} logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="flex-1 min-w-[220px] max-w-xl" placeholder="Search items..." />

            <div className="flex h-10 rounded-xl border bg-white overflow-hidden shrink-0" style={{ borderColor: c.border }}>
              {statusOptions.map((s) => (
                <button key={s} type="button"
                  className="px-3 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer"
                  style={{ backgroundColor: statusFilter === s ? c.primary : "transparent", color: statusFilter === s ? "#fff" : c.textMuted }}
                  onClick={() => { setStatusFilter(s); setPage(1); }}>
                  {s === "All" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <VDropdown open={categoryOpen} onOpenChange={setCategoryOpen}
              trigger={
                <VFilterButton active={!!categoryFilter} className="pl-3 pr-8 relative" onClick={() => setCategoryOpen(!categoryOpen)}>
                  {categoryFilter ? (
                    <>{(() => { const cc = categories.find(v => v.label === categoryFilter); return cc ? <cc.icon size={14} style={{ color: cc.color }} /> : null; })()}<span>{categoryFilter}</span></>
                  ) : (
                    <><Grid3X3 size={14} style={{ color: c.textMuted }} /><span>All Categories</span></>
                  )}
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textMuted }} />
                </VFilterButton>
              }>
              {(close) => (
                <>
                  <VDropdownItem active={!categoryFilter} onSelect={() => { setCategoryFilter(null); close(); setPage(1); }}><Grid3X3 size={14} style={{ color: c.textMuted }} />All Categories</VDropdownItem>
                  <div style={{ borderColor: c.border }} className="mx-3 border-t" />
                  {categories.map((cat) => (
                    <VDropdownItem key={cat.label} active={categoryFilter === cat.label} onSelect={() => { setCategoryFilter(cat.label); close(); setPage(1); }}><cat.icon size={14} style={{ color: cat.color }} />{cat.label}</VDropdownItem>
                  ))}
                </>
              )}
            </VDropdown>

            <VDropdown open={sortOpen} onOpenChange={setSortOpen} width="w-32"
              trigger={
                <VFilterButton onClick={() => setSortOpen(!sortOpen)}>
                  <ArrowUpDown size={13} style={{ color: c.textMuted }} /><span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span><ChevronDown size={12} className="text-[#64748b]" />
                </VFilterButton>
              }>
              {(close) => (
                <>
                  {["newest", "oldest"].map((opt) => (
                    <VDropdownItem key={opt} active={sortOrder === opt} onSelect={() => { setSortOrder(opt as any); close(); setPage(1); }}>{opt === "newest" ? "Newest" : "Oldest"}</VDropdownItem>
                  ))}
                </>
              )}
            </VDropdown>

            {hasFilters && (
              <button type="button"
                className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-medium border bg-white transition-all duration-200 cursor-pointer"
                style={{ borderColor: c.borderLight, color: c.primary, fontWeight: "600" }}
                onClick={() => { setQuery(""); setStatusFilter("All"); setCategoryFilter(null); setSortOrder("newest"); setPage(1); }}>
                <RotateCcw size={13} /><span>Reset</span>
              </button>
            )}

            <div className="ml-auto">
              <VButton size="md" onClick={openAdd}><Plus size={15} /> Add Item</VButton>
            </div>
          </div>

          {/* Grid */}
          {loading ? null : loadError ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Package size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load items</p>
              <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{loadError}</p>
              <VButton variant="secondary" onClick={() => void fetchItems()}>
                <RotateCcw size={14} /> Try again
              </VButton>
            </VCard>
          ) : filtered.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>No items found</p>
              <p className="text-sm mt-1" style={{ color: c.textLight }}>Try adjusting filters or add a new item.</p>
            </VCard>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 flex-1">
                {paginated.map((it) => {
                  const Icon = filterIcons[it.category] || Package;
                  return (
                    <VCard key={it.id} className="p-5 flex flex-col transition-all duration-200 hover:shadow-lg" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                      <div className="w-full h-40 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden shrink-0"
                        style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}>
                        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                        <Icon size={40} style={{ color: c.primary, opacity: 0.6 }} />
                        <span className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border" style={{ borderColor: c.border, color: c.textMuted }}>{it.id}</span>
                      </div>
                      <div className="flex items-start justify-between gap-2 mb-1 min-h-[20px]">
                        <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{it.name}</h3>
                        <VBadge color={statusColor(it.status)}>{it.status}</VBadge>
                      </div>
                      <p className="text-xs flex items-center gap-1 truncate" style={{ color: c.textMuted }}><MapPin size={12} className="shrink-0" /> <span className="truncate">{it.location}</span></p>
                      <p className="text-xs flex items-center gap-1 mt-1" style={{ color: c.textMuted }}><Clock size={12} className="shrink-0" style={{ color: c.textLight }} /> {new Date(it.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {it.category}</p>
                      <p className="text-xs flex items-center gap-1 mt-1 min-h-[16px]" style={{ color: c.primary, visibility: it.locker ? "visible" : "hidden" }}><Lock size={12} /> {it.locker ? `Locker ${it.locker}` : "placeholder"}</p>
                      <div className="flex items-center gap-2 mt-auto pt-4">
                        <button type="button" onClick={() => openEdit(it)}
                          className="flex-1 h-9 rounded-xl text-xs font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                          style={{ borderColor: c.border, color: c.textMuted }}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" onClick={() => openDelete(it)}
                          className="w-9 h-9 rounded-xl border bg-white flex items-center justify-center transition-colors duration-200 cursor-pointer"
                          style={{ borderColor: c.border, color: c.danger }}>
                          <Trash2 size={14} />
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

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <VCard className="relative w-full max-w-lg p-6 lg:p-7 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>{editing ? "Edit Item" : "Add New Item"}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Item name <span style={{ color: c.danger }}>*</span></label>
                <VInput value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Black Adidas backpack" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Category <span style={{ color: c.danger }}>*</span></label>
                  <VDropdown open={formCatOpen} onOpenChange={setFormCatOpen} width="w-full"
                    trigger={
                      <button type="button" className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm font-medium border bg-white text-left cursor-pointer relative"
                        style={{ borderColor: c.border, color: formCategory ? c.text : c.textMuted }}
                        onClick={() => setFormCatOpen(!formCatOpen)}>
                        {formCategory ? <><span>{formCategory}</span></> : <>Select category</>}
                        <ChevronDown size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textMuted }} />
                      </button>
                    }>
                    {(close) => (<>{categories.map((cat) => (<VDropdownItem key={cat.label} active={formCategory === cat.label} onSelect={() => { setFormCategory(cat.label); close(); }}><cat.icon size={14} style={{ color: cat.color }} />{cat.label}</VDropdownItem>))}</>)}
                  </VDropdown>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Date <span style={{ color: c.danger }}>*</span></label>
                  <VInput type="date" value={formDate} max={today} onChange={(e) => setFormDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Found location <span style={{ color: c.danger }}>*</span></label>
                  <VInput value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="e.g. Library 3rd Floor" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Locker</label>
                  <VInput value={formLocker} onChange={(e) => setFormLocker(e.target.value)} placeholder="e.g. A12 (optional)" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Description</label>
                <VTextarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} placeholder="Color, brand, distinguishing features..." />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Photo</label>
                <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
                {formPreview ? (
                  <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                    <img src={formPreview} alt="Item preview" className="w-full h-40 object-cover" />
                    <button type="button" onClick={clearPhoto}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors duration-200 cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => uploadRef.current?.click()}
                      className="h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                      style={{ borderColor: c.border, color: c.textMuted, backgroundColor: c.fill }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; e.currentTarget.style.color = c.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textMuted; }}>
                      <Upload size={20} /><span className="text-xs font-medium">Upload</span>
                      <span className="text-[11px]" style={{ color: c.textLight }}>Gallery / Files</span>
                    </button>
                    <button type="button" onClick={openLiveCamera}
                      className="h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                      style={{ borderColor: c.border, color: c.textMuted, backgroundColor: c.fill }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; e.currentTarget.style.color = c.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textMuted; }}>
                      <Camera size={20} /><span className="text-xs font-medium">Take Photo</span>
                      <span className="text-[11px]" style={{ color: c.textLight }}>Live camera</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <VButton variant="secondary" onClick={() => setShowModal(false)}>Cancel</VButton>
                <VButton onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Add Item"}</VButton>
              </div>
            </div>
          </VCard>
        </div>
      )}

      {/* Live camera modal for desktop */}
      {showCamera && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeLiveCamera} />
          <VCard className="relative w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Take Photo</h3>
              <button type="button" onClick={closeLiveCamera} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
              <video ref={liveVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <p className="text-[11px] mt-3 text-center" style={{ color: c.textMuted }}>Position item in frame, then capture.</p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <VButton variant="secondary" onClick={closeLiveCamera}>Cancel</VButton>
              <VButton onClick={captureLivePhoto}><Camera size={14} /> Capture</VButton>
            </div>
          </VCard>
        </div>
      )}

      {/* Single-confirm delete dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeDelete} />
          <VCard className="relative w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#fef2f2" }}>
              <Trash2 size={22} style={{ color: c.danger }} />
            </div>
            <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Delete this item?</h3>
            <p className="text-sm mb-1" style={{ color: c.textMuted }}>
              <span className="font-semibold" style={{ color: c.text }}>{deleteTarget.name}</span> ({deleteTarget.id})
            </p>
            <p className="text-xs mb-5" style={{ color: c.textLight }}>This will remove it from inventory. This action cannot be undone.</p>
            <div className="flex items-center gap-2">
              <VButton variant="secondary" className="flex-1" onClick={closeDelete}>Cancel</VButton>
              <VButton variant="danger" className="flex-1" onClick={confirmDeleteFinal}>Delete</VButton>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
