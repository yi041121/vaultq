"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Grid3X3, Lock, FileText, Users, Search, Plus, Wrench, Unlock, Eye, X, CheckCircle2, PackageSearch,
  ArrowLeftRight, ChevronLeft, ChevronRight, Pencil, Trash2,
  MapPin, Clock,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { StudentShell } from "@/components/student-shell";
import { PhotoViewerModal } from "@/components/photo-viewer-modal";
import { FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { categoryIcon } from "@/lib/category-icons";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { matchesSearch } from "@/lib/search";
import {
  VCard, VButton, VInput, VSearchInput, vcolors as c, font as f,
} from "@/components/ui/vault";

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Intake", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

type Locker = {
  id: string;
  number: string;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
  item?: { id: string; name: string; category: string; student?: string; date?: string; imageUrl?: string | null };
};

const initialLockers: Locker[] = [
  { id: "1", number: "A01", status: "AVAILABLE" },
  { id: "2", number: "A02", status: "OCCUPIED", item: { id: "ITM-002", name: "MacBook Pro 14\"", category: "Electronics", student: "Alex Tan", date: "24 Jul 2026" } },
  { id: "3", number: "A03", status: "AVAILABLE" },
  { id: "4", number: "A04", status: "MAINTENANCE" },
  { id: "5", number: "A05", status: "AVAILABLE" },
  { id: "6", number: "A06", status: "OCCUPIED", item: { id: "ITM-006", name: "AirPods Pro", category: "Electronics", student: "John Doe", date: "22 Jul 2026" } },
  { id: "7", number: "B01", status: "AVAILABLE" },
  { id: "8", number: "B02", status: "OCCUPIED", item: { id: "ITM-008", name: "Brown Leather Wallet", category: "Bags", student: "Sarah Lim", date: "23 Jul 2026" } },
  { id: "9", number: "B03", status: "AVAILABLE" },
  { id: "10", number: "B04", status: "AVAILABLE" },
  { id: "11", number: "B05", status: "MAINTENANCE" },
  { id: "12", number: "B06", status: "AVAILABLE" },
];

const mockFoundItems = [
  { id: "ITM-004", name: "Student ID Card", category: "Student Cards", imageUrl: null },
  { id: "ITM-008", name: "Physics Notes Folder", category: "Documents", imageUrl: null },
];

function statusColor(s: string) {
  switch (s) {
    case "AVAILABLE": return "#7FB8B5";
    case "OCCUPIED": return "#355C8A";
    case "MAINTENANCE": return "#dc2626";
    default: return "#7FB8B5";
  }
}

function fmtItemDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

let lockersCache: Locker[] | null = null;

export default function AdminLockers() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [lockers, setLockers] = useState<Locker[]>(lockersCache ?? initialLockers);
  const [filter, setFilter] = useState<"All" | Locker["status"]>("All");
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState<{ photos: string[]; index: number; title: string } | null>(null);
  const [itemDetail, setItemDetail] = useState<{ id: string; name: string; category: string; description: string; location: string; date: string; imageUrl: string | null; images: string[]; imageIndex: number; statusLabel: string; color: string } | null>(null);
  const [assignLocker, setAssignLocker] = useState<Locker | null>(null);
  const [assignItemId, setAssignItemId] = useState<string>("");
  const [changeLocker, setChangeLocker] = useState<Locker | null>(null);
  const [changeTargetId, setChangeTargetId] = useState<string>("");
  const [changingLocker, setChangingLocker] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<Locker | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [newLockerNumber, setNewLockerNumber] = useState("");
  const [addingLocker, setAddingLocker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiLive, setApiLive] = useState(false);
  const [unassignedItems, setUnassignedItems] = useState<{ id: string; name: string; category: string; imageUrl?: string | null }[]>([]);

  function authHeaders(): Record<string, string> {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function mapApiLocker(raw: any): Locker {
    return {
      id: raw.id,
      number: raw.lockerNumber,
      status: raw.status,
      item: raw.item ? { id: raw.item.id, name: raw.item.itemName, category: raw.item.category || "", imageUrl: raw.item.imageUrl || null } : undefined,
    };
  }

  async function fetchLockers() {
    try {
      const res = await fetch("/api/lockers", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load lockers");
      const list = (data.data || []).map(mapApiLocker);
      setLockers(list);
      lockersCache = list;
      setApiLive(true);
    } catch (e: any) {
      console.warn("Lockers API unreachable, using mock data:", e?.message);
      setLockers(initialLockers);
      setApiLive(false);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUnassigned() {
    try {
      const res = await fetch("/api/items?status=FOUND&light=1", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setUnassignedItems(
        (data.data || [])
          .filter((it: any) => !it.locker)
          .map((it: any) => ({ id: it.id, name: it.itemName, category: it.category || "Others", imageUrl: it.imageUrl || null }))
      );
    } catch {
      // Assign modal falls back to bundled mock list
    }
  }

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
    fetchLockers();
    fetchUnassigned();
  }, []);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/login?skip=1&loggedOut=1"); }
  if (!user || !mounted) return null;

  const stats = {
    total: lockers.length,
    available: lockers.filter((l) => l.status === "AVAILABLE").length,
    occupied: lockers.filter((l) => l.status === "OCCUPIED").length,
    maintenance: lockers.filter((l) => l.status === "MAINTENANCE").length,
  };

  const filtered = lockers.filter((l) => {
    if (filter !== "All" && l.status !== filter) return false;
    if (!matchesSearch(query, [l.number, l.status, l.item?.name, l.item?.category, l.number ? `locker ${l.number}` : ""])) return false;
    return true;
  });

  async function refresh() {
    await fetchLockers();
    await fetchUnassigned();
  }

  async function updateStatus(id: string, status: Locker["status"]) {
    const current = lockers.find((l) => l.id === id);
    if (!apiLive) {
      setLockers(lockers.map((l) => l.id === id ? { ...l, status, item: status === "AVAILABLE" ? undefined : l.item } : l));
      showCenteredMessage("success", `Locker ${current?.number} → ${status.toLowerCase()}`);
      return;
    }
    try {
      const body: any = {};
      // Releasing an occupied locker back to available frees the item inside
      if (status === "AVAILABLE" && current?.status === "OCCUPIED") body.release = true;
      else body.status = status;
      const res = await fetch(`/api/lockers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update locker");
      showCenteredMessage("success", `Locker ${current?.number} → ${status.toLowerCase()}`);
      await refresh();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Update failed");
    }
  }

  async function handleAssign() {
    if (!assignLocker || !assignItemId) {
      showCenteredMessage("error", "Select an item");
      return;
    }
    const pool = unassignedItems.length ? unassignedItems : mockFoundItems;
    const item = pool.find((it) => it.id === assignItemId);
    if (!item) return;
    if (!apiLive) {
      setLockers(lockers.map((l) => l.id === assignLocker.id ? { ...l, status: "OCCUPIED" as const, item: { id: item.id, name: item.name, category: item.category, student: "—", date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) } } : l));
      showCenteredMessage("success", `Assigned ${item.name} to ${assignLocker.number}`);
      setAssignLocker(null);
      setAssignItemId("");
      return;
    }
    try {
      const res = await fetch(`/api/lockers/${assignLocker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ itemId: assignItemId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to assign item");
      showCenteredMessage("success", `Assigned ${item.name} to ${assignLocker.number}`);
      setAssignLocker(null);
      setAssignItemId("");
      await refresh();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Assign failed");
    }
  }

  function openChangeLocker(locker: Locker) {
    setChangeLocker(locker);
    setChangeTargetId("");
  }

  async function handleChangeLocker() {
    const locker = changeLocker;
    if (!locker?.item || !changeTargetId) return;
    const target = lockers.find((l) => l.id === changeTargetId);
    if (!target) return;
    setChangingLocker(true);
    try {
      if (!apiLive) {
        setLockers((prev) => prev.map((l) => {
          if (l.id === locker.id) return { ...l, status: "AVAILABLE" as const, item: undefined };
          if (l.id === target.id) return { ...l, status: "OCCUPIED" as const, item: locker.item };
          return l;
        }));
        showCenteredMessage("success", `${locker.item.name} moved to ${target.number}`);
        setChangeLocker(null);
        setChangeTargetId("");
        return;
      }
      const res = await fetch(`/api/items/${locker.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ lockerId: target.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to change locker");
      showCenteredMessage("success", `${locker.item.name} moved to ${target.number}`);
      setChangeLocker(null);
      setChangeTargetId("");
      await refresh();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Change locker failed");
    } finally {
      setChangingLocker(false);
    }
  }

  async function openItemDetails(locker: Locker) {
    const item = locker.item;
    if (!item) return;
    setItemDetail({ id: item.id, name: item.name, category: item.category, description: "", location: "", date: "", imageUrl: item.imageUrl || null, images: item.imageUrl ? [item.imageUrl] : [], imageIndex: 0, statusLabel: "Found", color: "#7FB8B5" });
    try {
      const res = await fetch(`/api/items/${item.id}`, { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const fresh = data?.data;
      if (!res.ok || !data?.success || !fresh) return;
      const reportImages: string[] = Array.isArray(fresh.reports)
        ? fresh.reports.flatMap((r: any) => (Array.isArray(r.imageUrls) ? r.imageUrls : []))
        : [];
      const images = Array.from(new Set([fresh.imageUrl, ...reportImages].filter(Boolean))) as string[];
      setItemDetail((prev) => (prev && prev.id === item.id ? {
        ...prev,
        name: fresh.itemName || prev.name,
        category: fresh.category || prev.category,
        description: fresh.description || "",
        location: fresh.foundLocation || "",
        date: fresh.foundDate ? String(fresh.foundDate).slice(0, 10) : "",
        imageUrl: images[0] || prev.imageUrl,
        images: images.length ? images : prev.images,
        imageIndex: Math.min(prev.imageIndex, Math.max(0, (images.length || prev.images.length) - 1)),
        statusLabel: fresh.status === "CLAIMED" ? "Claimed" : fresh.status === "RETRIEVED" ? "Retrieved" : fresh.status === "EXPIRED" ? "Expired" : "Found",
        color: fresh.status === "CLAIMED" ? "#355C8A" : fresh.status === "RETRIEVED" ? "#16a34a" : fresh.status === "EXPIRED" ? "#64748b" : "#7FB8B5",
      } : prev));
    } catch {
      // Keep the values already shown from the locker card.
    }
  }

  function handleReleaseLocker() {
    const target = releaseTarget;
    setReleaseTarget(null);
    if (target) void updateStatus(target.id, "AVAILABLE");
  }

  async function handleAddLocker() {
    const number = newLockerNumber.trim().toUpperCase();
    if (!number) {
      showCenteredMessage("error", "Enter a locker number");
      return;
    }
    if (lockers.some((l) => l.number.toUpperCase() === number)) {
      showCenteredMessage("error", "Locker already exists");
      return;
    }
    setAddingLocker(true);
    try {
      if (!apiLive) {
        setLockers((prev) => [...prev, { id: `local-${Date.now()}`, number, status: "AVAILABLE" }]);
        lockersCache = null;
        showCenteredMessage("success", `Locker ${number} added`);
        setNewLockerNumber("");
        return;
      }
      const res = await fetch("/api/lockers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ lockerNumber: number }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to add locker");
      showCenteredMessage("success", `Locker ${number} added`);
      setNewLockerNumber("");
      lockersCache = null;
      await fetchLockers();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Failed to add locker");
    } finally {
      setAddingLocker(false);
    }
  }

  async function handleDeleteLocker(locker: Locker) {
    if (locker.item) {
      showCenteredMessage("error", "Release the item before deleting this locker");
      return;
    }
    try {
      if (!apiLive) {
        setLockers((prev) => prev.filter((l) => l.id !== locker.id));
        lockersCache = null;
        showCenteredMessage("success", `Locker ${locker.number} deleted`);
        return;
      }
      const res = await fetch(`/api/lockers/${locker.id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to delete locker");
      showCenteredMessage("success", `Locker ${locker.number} deleted`);
      lockersCache = null;
      await fetchLockers();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Failed to delete locker");
    }
  }

  const hasFilters = Boolean(query || filter !== "All");

  function resetFilters() {
    setQuery("");
    setFilter("All");
  }

  return (
    <StudentShell active="Lockers" userName={user.name} userRole={user.role} pageTitle="Locker Management" bottomNav={adminNav} logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full h-full flex flex-col">
          <FilterPanel
            search={
              <VSearchInput value={query} onChange={setQuery} className="w-full"
                size="lg" clearable placeholder="Search locker or item..." />
            }
            actions={
              <button type="button" aria-label="Manage lockers" title="Manage lockers"
                onClick={() => setManageOpen(true)}
                className="w-full sm:w-auto h-10 px-3 rounded-xl border bg-white inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer hover:bg-[#f8fafc] transition-colors duration-150"
                style={{ borderColor: c.border, color: c.textMuted }}>
                <Pencil size={14} /> Edit
              </button>
            }
            filters={
              <div className="vq-scroll-x flex h-10 rounded-xl border bg-white shrink-0" style={{ borderColor: c.border }}>
                {(["All", "AVAILABLE", "OCCUPIED", "MAINTENANCE"] as const).map((s) => (
                  <button key={s} type="button"
                    className="px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer"
                    style={{ backgroundColor: filter === s ? c.primary : "transparent", color: filter === s ? "#fff" : c.textMuted }}
                    onClick={() => setFilter(s)}>
                    {s === "All" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            }
            reset={hasFilters ? <ResetFiltersButton onClick={resetFilters} /> : null}
          />

          {/* Grid */}
          {loading ? null : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1">
            {filtered.map((l) => (
              <VCard key={l.id} className="p-5 flex flex-col transition-all duration-200 hover:shadow-md" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold" style={{ color: c.text }}>{l.number}</h3>
                  <span className="ml-auto text-[11px] font-medium" style={{ color: statusColor(l.status) }}>
                    {l.status.charAt(0) + l.status.slice(1).toLowerCase()}
                  </span>
                </div>
                <div className="w-full h-28 rounded-xl mb-3 flex flex-col items-center justify-center gap-1.5 relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}>
                  {l.item?.imageUrl ? (
                    <button type="button"
                      aria-label={`View ${l.item.name} photo`}
                      className="absolute inset-0 cursor-pointer group"
                      onClick={() => setViewer({ photos: [l.item!.imageUrl!], index: 0, title: l.item!.name })}>
                      <img src={l.item.imageUrl} alt={l.item.name} className="w-full h-full object-cover" />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                          <Eye size={13} /> View photo
                        </span>
                      </span>
                    </button>
                  ) : (
                    <>
                      <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.2), transparent 60%)" }} />
                      {l.status === "AVAILABLE" ? <CheckCircle2 size={26} style={{ color: statusColor(l.status), opacity: 0.8 }} className="relative" /> : l.status === "OCCUPIED" ? <Lock size={26} style={{ color: statusColor(l.status), opacity: 0.8 }} className="relative" /> : <Wrench size={26} style={{ color: statusColor(l.status), opacity: 0.8 }} className="relative" />}
                    </>
                  )}
                </div>
                {l.item ? (
                  <div className="rounded-xl p-2.5 mb-3 flex flex-wrap items-center gap-2.5" style={{ backgroundColor: c.fill }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{l.item.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: c.textMuted }}>{l.item.category}</p>
                    </div>
                    <VButton variant="secondary" size="sm" onClick={() => void openItemDetails(l)}><Eye size={13} /> View</VButton>
                  </div>
                ) : (
                  <p className="text-xs text-center py-3 mb-3 rounded-lg border-2 border-dashed" style={{ borderColor: c.border, color: c.textLight, backgroundColor: c.card }}>
                    {l.status === "MAINTENANCE" ? "Under maintenance" : "available for assignment"}
                  </p>
                )}
                {l.status !== "OCCUPIED" && (
                  <div className="flex items-center gap-2 mt-auto">
                    {l.status === "AVAILABLE" ? (
                      <>
                        <VButton variant="secondary" size="md" className="flex-1" style={{ paddingLeft: 8, paddingRight: 8 }}
                          onClick={() => updateStatus(l.id, "MAINTENANCE")}>
                          <Wrench size={13} /> Maintenance
                        </VButton>
                        <VButton size="md" className="flex-1" style={{ paddingLeft: 8, paddingRight: 8 }}
                          onClick={() => setAssignLocker(l)}>
                          <Plus size={13} /> Assign
                        </VButton>
                      </>
                    ) : (
                      <VButton size="md" className="flex-1" onClick={() => updateStatus(l.id, "AVAILABLE")}>Set available</VButton>
                    )}
                  </div>
                )}
                {l.status === "OCCUPIED" && (
                  <div className="flex items-center gap-2 mt-auto">
                    <VButton variant="secondary" size="md" className="flex-1" style={{ paddingLeft: 8, paddingRight: 8 }}
                      onClick={() => openChangeLocker(l)}>
                      <ArrowLeftRight size={13} /> Change locker
                    </VButton>
                    <VButton size="md" className="flex-1" style={{ paddingLeft: 8, paddingRight: 8 }}
                      onClick={() => setReleaseTarget(l)}>
                      <Unlock size={13} /> Release
                    </VButton>
                  </div>
                )}
              </VCard>
            ))}
          </div>
          )}
          {!loading && filtered.length === 0 && (
            <VCard className="py-16 text-center mt-4">
              <Search size={32} className="mx-auto mb-3" style={{ color: c.textLight }} />
              <p className="text-sm" style={{ color: c.textMuted }}>No lockers match filter.</p>
            </VCard>
          )}
        </div>
      </main>

      {releaseTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setReleaseTarget(null)} />
          <VCard className="relative w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: c.primarySoft }}>
              <Unlock size={22} style={{ color: c.primary }} />
            </div>
            <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Release this locker?</h3>
            <p className="text-xs mb-5" style={{ color: c.textMuted }}>
              {releaseTarget.item?.name || "The item"} will be removed from locker {releaseTarget.number}.
            </p>
            <div className="flex items-center gap-2">
              <VButton variant="secondary" className="flex-1" onClick={() => setReleaseTarget(null)}>Cancel</VButton>
              <VButton className="flex-1" onClick={handleReleaseLocker}>Release</VButton>
            </div>
          </VCard>
        </div>
      )}

      {manageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setManageOpen(false)} />
          <VCard className="relative w-full max-w-md max-h-[90vh] overflow-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Manage lockers</h3>
              <button type="button" onClick={() => setManageOpen(false)} aria-label="Close manage lockers"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>Add a locker</p>
            <div className="flex items-center gap-2 mb-4">
              <VInput value={newLockerNumber} placeholder="e.g. C01" maxLength={10}
                onChange={(e) => setNewLockerNumber(e.target.value.toUpperCase())} />
              <VButton onClick={handleAddLocker} disabled={addingLocker || !newLockerNumber.trim()}>
                <Plus size={13} /> {addingLocker ? "Adding..." : "Add"}
              </VButton>
            </div>

            <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>Existing lockers</p>
            <div className="space-y-2 max-h-64 overflow-auto">
              {lockers.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5"
                  style={{ borderColor: c.border }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: c.text }}>{l.number}</p>
                    <p className="text-[11px]" style={{ color: statusColor(l.status) }}>
                      {l.status.charAt(0) + l.status.slice(1).toLowerCase()}
                      {l.item ? ` · ${l.item.name}` : ""}
                    </p>
                  </div>
                  <button type="button" aria-label={`Delete locker ${l.number}`}
                    title={l.item ? "Release the item before deleting" : "Delete locker"}
                    disabled={!!l.item}
                    onClick={() => handleDeleteLocker(l)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:cursor-not-allowed transition-colors duration-150 enabled:hover:bg-[#fef2f2]"
                    style={{ color: l.item ? c.textLight : c.danger }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {lockers.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: c.textLight }}>No lockers yet.</p>
              )}
            </div>
          </VCard>
        </div>
      )}

      {/* Assign modal */}
      {assignLocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setAssignLocker(null)} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Assign to {assignLocker.number}</h3>
              <button type="button" onClick={() => setAssignLocker(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: c.textMuted }}>Select a found item without locker to assign:</p>
            <div className="space-y-2 mb-4 max-h-60 overflow-auto">
              {(unassignedItems.length ? unassignedItems : mockFoundItems).map((it) => (
                <div key={it.id} role="button" tabIndex={0}
                  onClick={() => setAssignItemId(it.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAssignItemId(it.id); } }}
                  className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors duration-200 cursor-pointer ${assignItemId === it.id ? "bg-[#e6eef5] border-[#355C8A]" : "bg-white hover:bg-[#f8fafc]"}`}
                  style={{ borderColor: assignItemId === it.id ? c.primary : c.border }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate" style={{ color: c.text }}>{it.name}</p>
                      {it.imageUrl && (
                        <button type="button" aria-label={`View ${it.name} photo`}
                          onClick={(e) => { e.stopPropagation(); setViewer({ photos: [it.imageUrl!], index: 0, title: it.name }); }}
                          className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#e2e8f0] shrink-0"
                          style={{ color: c.textMuted }}>
                          <Eye size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: c.textMuted }}>{it.category}</p>
                  </div>
                  {assignItemId === it.id && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.primary }} />}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <VButton variant="secondary" onClick={() => setAssignLocker(null)}>Cancel</VButton>
              <VButton onClick={handleAssign} disabled={!assignItemId}>Assign</VButton>
            </div>
          </VCard>
        </div>
      )}

      {/* Change locker modal */}
      {changeLocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => { if (!changingLocker) setChangeLocker(null); }} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Change locker</h3>
              <button type="button" onClick={() => { if (!changingLocker) setChangeLocker(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: c.textMuted }}>
              {changeLocker.item?.name} is in locker {changeLocker.number}. Select another available locker.
            </p>
            <div className="space-y-2 mb-4 max-h-60 overflow-auto">
              {lockers.filter((l) => l.status === "AVAILABLE").map((l) => (
                <button key={l.id} type="button" onClick={() => setChangeTargetId(l.id)}
                  className="w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors duration-200 cursor-pointer"
                  style={{ borderColor: changeTargetId === l.id ? c.primary : c.border, backgroundColor: changeTargetId === l.id ? c.primarySoft : "#fff" }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: c.text }}>Locker {l.number}</p>
                    <p className="text-xs" style={{ color: c.textMuted }}>Available</p>
                  </div>
                  {changeTargetId === l.id && <CheckCircle2 size={16} style={{ color: c.primary }} />}
                </button>
              ))}
              {lockers.filter((l) => l.status === "AVAILABLE").length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: c.textLight }}>No other lockers are available.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <VButton variant="secondary" onClick={() => setChangeLocker(null)} disabled={changingLocker}>Cancel</VButton>
              <VButton onClick={handleChangeLocker} disabled={!changeTargetId || changingLocker}>
                {changingLocker ? "Moving..." : "Change locker"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}
      {itemDetail && (
        <ItemDetailsModal
          title={itemDetail.name}
          statusLabel={itemDetail.statusLabel}
          statusColor={itemDetail.color}
          category={itemDetail.category}
          location={itemDetail.location}
          date={fmtItemDate(itemDetail.date)}
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
    </StudentShell>
  );
}
