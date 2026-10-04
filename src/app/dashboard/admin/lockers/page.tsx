"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Grid3X3, Lock, FileText, Users, Search, Plus, Wrench, Unlock, Eye, X, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VBadge, VButton, VSearchInput, vcolors as c, font as f,
} from "@/components/ui/vault";

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

type Locker = {
  id: string;
  number: string;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
  item?: { name: string; category: string; student?: string; date?: string };
};

const initialLockers: Locker[] = [
  { id: "1", number: "A01", status: "AVAILABLE" },
  { id: "2", number: "A02", status: "OCCUPIED", item: { name: "MacBook Pro 14\"", category: "Electronics", student: "Alex Tan", date: "24 Jul 2026" } },
  { id: "3", number: "A03", status: "AVAILABLE" },
  { id: "4", number: "A04", status: "MAINTENANCE" },
  { id: "5", number: "A05", status: "AVAILABLE" },
  { id: "6", number: "A06", status: "OCCUPIED", item: { name: "AirPods Pro", category: "Electronics", student: "John Doe", date: "22 Jul 2026" } },
  { id: "7", number: "B01", status: "AVAILABLE" },
  { id: "8", number: "B02", status: "OCCUPIED", item: { name: "Brown Leather Wallet", category: "Bags", student: "Sarah Lim", date: "23 Jul 2026" } },
  { id: "9", number: "B03", status: "AVAILABLE" },
  { id: "10", number: "B04", status: "AVAILABLE" },
  { id: "11", number: "B05", status: "MAINTENANCE" },
  { id: "12", number: "B06", status: "AVAILABLE" },
];

const mockFoundItems = [
  { id: "ITM-004", name: "Student ID Card", category: "Student Cards" },
  { id: "ITM-008", name: "Physics Notes Folder", category: "Documents" },
];

function statusColor(s: string) {
  switch (s) {
    case "AVAILABLE": return "#7FB8B5";
    case "OCCUPIED": return "#355C8A";
    case "MAINTENANCE": return "#dc2626";
    default: return "#7FB8B5";
  }
}

export default function AdminLockers() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [lockers, setLockers] = useState<Locker[]>(initialLockers);
  const [filter, setFilter] = useState<"All" | Locker["status"]>("All");
  const [query, setQuery] = useState("");
  const [selectedLocker, setSelectedLocker] = useState<Locker | null>(null);
  const [assignLocker, setAssignLocker] = useState<Locker | null>(null);
  const [assignItemId, setAssignItemId] = useState<string>("");

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
  }, []);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); toast.success("Logged out"); router.push("/login?skip=1"); }
  if (!user || !mounted) return null;

  const stats = {
    total: lockers.length,
    available: lockers.filter((l) => l.status === "AVAILABLE").length,
    occupied: lockers.filter((l) => l.status === "OCCUPIED").length,
    maintenance: lockers.filter((l) => l.status === "MAINTENANCE").length,
  };

  const filtered = lockers.filter((l) => {
    if (filter !== "All" && l.status !== filter) return false;
    if (query && !l.number.toLowerCase().includes(query.toLowerCase()) && !l.item?.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  function updateStatus(id: string, status: Locker["status"]) {
    setLockers(lockers.map((l) => l.id === id ? { ...l, status, item: status === "AVAILABLE" ? undefined : l.item } : l));
    toast.success(`Locker ${lockers.find((l) => l.id === id)?.number} → ${status.toLowerCase()}`);
    setSelectedLocker(null);
  }

  function handleAssign() {
    if (!assignLocker || !assignItemId) {
      toast.error("Select an item");
      return;
    }
    const item = mockFoundItems.find((it) => it.id === assignItemId);
    if (!item) return;
    setLockers(lockers.map((l) => l.id === assignLocker.id ? { ...l, status: "OCCUPIED" as const, item: { name: item.name, category: item.category, student: "—", date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) } } : l));
    toast.success(`Assigned ${item.name} to ${assignLocker.number}`);
    setAssignLocker(null);
    setAssignItemId("");
  }

  return (
    <StudentShell active="Lockers" userName={user.name} userRole={user.role} pageTitle="Locker Management" bottomNav={adminNav} logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full h-full flex flex-col">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <VSearchInput value={query} onChange={setQuery} className="flex-1 min-w-[200px] max-w-md" placeholder="Search locker or item..." />
            <div className="flex h-10 rounded-xl border bg-white overflow-hidden" style={{ borderColor: c.border }}>
              {(["All", "AVAILABLE", "OCCUPIED", "MAINTENANCE"] as const).map((s) => (
                <button key={s} type="button"
                  className="px-3.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer"
                  style={{ backgroundColor: filter === s ? c.primary : "transparent", color: filter === s ? "#fff" : c.textMuted }}
                  onClick={() => setFilter(s)}>
                  {s === "All" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1">
            {filtered.map((l) => (
              <VCard key={l.id} className="p-5 flex flex-col transition-all duration-200 hover:shadow-md" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold" style={{ color: c.text }}>{l.number}</h3>
                </div>
                <div className="w-full h-28 rounded-xl mb-3 flex flex-col items-center justify-center gap-1.5 relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${c.borderLight}, #eef2f7)` }}>
                  <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.2), transparent 60%)" }} />
                  {l.status === "AVAILABLE" ? <CheckCircle2 size={26} style={{ color: statusColor(l.status), opacity: 0.8 }} className="relative" /> : l.status === "OCCUPIED" ? <Lock size={26} style={{ color: statusColor(l.status), opacity: 0.8 }} className="relative" /> : <Wrench size={26} style={{ color: statusColor(l.status), opacity: 0.8 }} className="relative" />}
                  <span className="relative text-[11px] font-medium" style={{ color: c.textMuted }}>{l.status}</span>
                </div>
                {l.item ? (
                  <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: c.fill }}>
                    <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{l.item.name}</p>
                    <p className="text-[11px] mt-1" style={{ color: c.textMuted }}>{l.item.category} · {l.item.student}</p>
                    <p className="text-[11px] flex items-center gap-1 mt-1" style={{ color: c.textMuted }}><Package size={10} /> {l.item.date}</p>
                  </div>
                ) : (
                  <p className="text-xs text-center py-3 mb-3 rounded-lg border-2 border-dashed" style={{ borderColor: c.border, color: c.textLight, backgroundColor: "#fff" }}>
                    {l.status === "MAINTENANCE" ? "Under maintenance" : "available for assignment"}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-auto">
                  <VButton variant="outline" size="md" className="flex-1" onClick={() => setSelectedLocker(l)}><Eye size={13} /> View</VButton>
                  {l.status === "AVAILABLE" && (
                    <VButton size="md" className="flex-1" onClick={() => setAssignLocker(l)}><Plus size={13} /> Assign</VButton>
                  )}
                  {l.status === "OCCUPIED" && (
                    <VButton variant="secondary" size="md" className="flex-1" onClick={() => updateStatus(l.id, "AVAILABLE")}><Unlock size={13} /> Release</VButton>
                  )}
                </div>
              </VCard>
            ))}
          </div>
          {filtered.length === 0 && (
            <VCard className="py-16 text-center mt-4">
              <Search size={32} className="mx-auto mb-3" style={{ color: c.textLight }} />
              <p className="text-sm" style={{ color: c.textMuted }}>No lockers match filter.</p>
            </VCard>
          )}
        </div>
      </main>

      {/* Details modal */}
      {selectedLocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedLocker(null)} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Locker {selectedLocker.number}</h3>
              <button type="button" onClick={() => setSelectedLocker(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <VBadge color={statusColor(selectedLocker.status)}>{selectedLocker.status}</VBadge>
              {selectedLocker.item && <span className="text-xs" style={{ color: c.textMuted }}>{selectedLocker.item.name}</span>}
            </div>
            {selectedLocker.item ? (
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: c.fill }}>
                <p className="text-sm font-semibold" style={{ color: c.text }}>{selectedLocker.item.name}</p>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{selectedLocker.item.category} · {selectedLocker.item.student} · {selectedLocker.item.date}</p>
              </div>
            ) : (
              <p className="text-sm p-4 rounded-xl border-2 border-dashed text-center mb-4" style={{ borderColor: c.border, color: c.textMuted, backgroundColor: "#fff" }}>
                {selectedLocker.status === "MAINTENANCE" ? "This locker is under maintenance." : "No item assigned."}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <VButton variant="outline" size="md" onClick={() => setSelectedLocker(null)}>Close</VButton>
              {selectedLocker.status !== "MAINTENANCE" && (
                <VButton variant="secondary" size="md" onClick={() => updateStatus(selectedLocker.id, "MAINTENANCE")}><Wrench size={14} /> Maintenance</VButton>
              )}
              {selectedLocker.status === "MAINTENANCE" && (
                <VButton size="md" onClick={() => updateStatus(selectedLocker.id, "AVAILABLE")}><Unlock size={14} /> Set Available</VButton>
              )}
              {selectedLocker.status === "OCCUPIED" && (
                <VButton variant="secondary" size="md" onClick={() => updateStatus(selectedLocker.id, "AVAILABLE")}><Unlock size={14} /> Release</VButton>
              )}
              {selectedLocker.status === "AVAILABLE" && (
                <VButton size="md" onClick={() => { setAssignLocker(selectedLocker); setSelectedLocker(null); }}><Plus size={14} /> Assign Item</VButton>
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
              {mockFoundItems.map((it) => (
                <button key={it.id} type="button" onClick={() => setAssignItemId(it.id)}
                  className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors duration-200 cursor-pointer ${assignItemId === it.id ? "bg-[#e6eef5] border-[#355C8A]" : "bg-white hover:bg-[#f8fafc]"}`}
                  style={{ borderColor: assignItemId === it.id ? c.primary : c.border }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: c.text }}>{it.name}</p>
                    <p className="text-xs" style={{ color: c.textMuted }}>{it.category} · {it.id}</p>
                  </div>
                  {assignItemId === it.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <VButton variant="secondary" onClick={() => setAssignLocker(null)}>Cancel</VButton>
              <VButton onClick={handleAssign} disabled={!assignItemId}>Assign</VButton>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
