"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FileText, Clock,
  Package, Monitor, Briefcase, CreditCard, Key,
  BookText, CupSoda, ChevronRight, PlusCircle,
  BellRing, User, RefreshCw,
  AlertCircle, Grid3X3, X, Eye, MapPin
} from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { VCard, VBadge, VButton, vcolors as c, font as f, iconSize } from "@/components/ui/vault";

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

const foundItems = [
  { name: "MacBook Pro 14\"", location: "Library 3rd Floor", date: "24 Jul 2026", status: "Found", color: "#7FB8B5", category: "Electronics", description: "Space Gray, M3 chip, 16GB RAM. Found on table near window with black sleeve. Has small dent on lid and Apple sticker." },
  { name: "Brown Leather Wallet", location: "Student Lounge", date: "23 Jul 2026", status: "Found", color: "#7FB8B5", category: "Bags", description: "Brown leather bifold wallet with zip compartment. Contains IC and student card inside. Found on sofa." },
  { name: "AirPods Pro", location: "Sports Complex", date: "22 Jul 2026", status: "Claimed", color: "#355C8A", category: "Electronics", description: "White AirPods Pro 2nd gen with MagSafe case. Left side has scratch." },
  { name: "Student ID Card", location: "Cafeteria", date: "21 Jul 2026", status: "Found", color: "#7FB8B5", category: "Student Cards", description: "Student ID for Faculty of Computing, matric 2000132602, photo matches holder. Found near counter." },
];

const myClaims = [
  { item: "MacBook Pro 14\"", status: "QR Ready", statusColor: "#29486A" },
  { item: "Brown Leather Wallet", status: "Under Review", statusColor: "#355C8A" },
  { item: "AirPods Pro", status: "QR Ready", statusColor: "#29486A" },
  { item: "Student ID Card", status: "Pending", statusColor: "#64748b" },
];

const stats = [
  { label: "Total Found Items", value: "24", icon: Package, color: "#355C8A" },
  { label: "Active Claims", value: "4", icon: FileText, color: "#7FB8B5" },
  { label: "Returned This Week", value: "18", icon: RefreshCw, color: "#29486A" },
];

const announcements = [
  { title: "Lost & Found Tips", desc: "Label your belongings and always check the Lost & Found after events.", time: "Posted 2d ago", icon: BookText },
  { title: "Office Hours", desc: "Lost & Found office is open Mon-Fri 8AM - 6PM at Student Services.", time: "Posted 1w ago", icon: Clock },
  { title: "New QR Kiosk", desc: "A new self-service kiosk is now available in the library lobby.", time: "Posted 2w ago", icon: Monitor },
];

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [viewItem, setViewItem] = useState<typeof foundItems[0] | null>(null);

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
    router.push("/login?skip=1&loggedOut=1");
  }

  if (!user || !mounted) return null;

  const quickActions = [
    { label: "Report Lost Item", icon: AlertCircle, desc: "Submit a lost item report", path: "/dashboard/student/report?type=lost" },
    { label: "Report Found Item", icon: PlusCircle, desc: "Log a found item", path: "/dashboard/student/report?type=found" },
    { label: "My Claims", icon: FileText, desc: "Track your claims", path: "/dashboard/student/claims" },
    { label: "My Reports", icon: FileText, desc: "Track lost & found reports", path: "/dashboard/student/report?tab=reports" },
  ];

  return (
    <StudentShell active="Home" userName={user.name} userRole={user.role} pageTitle="Dashboard" logout={handleLogout}>
      <main className="pb-28 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full">
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {stats.map((s) => (
              <VCard key={s.label} className="p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `color-mix(in srgb, ${s.color} 8%, transparent)` }}>
                  <s.icon size={20} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: c.text }}>{s.value}</p>
                  <p className="text-sm" style={{ color: c.textMuted }}>{s.label}</p>
                </div>
              </VCard>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            {/* Latest Found Items */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className={f.sectionTitle} style={{ color: c.text }}>Latest Found Items</h2>
                <button className="text-sm font-medium flex items-center gap-1 transition-opacity duration-200 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => router.push("/dashboard/student/search")}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {foundItems.map((item) => (
                  <VCard key={item.name} className="p-4 lg:p-5 flex flex-col transition-all duration-200 hover:shadow-md">
                    <div className="w-full h-32 lg:h-40 rounded-xl mb-3 flex items-center justify-center cursor-pointer relative overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${c.borderLight}, ${c.fill})` }}
                      onClick={() => setViewItem(item)}>
                      <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 80% 20%, rgba(127,184,181,0.25), transparent 60%)" }} />
                      <Package size={32} style={{ color: c.primary, opacity: 0.6 }} />
                    </div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm lg:text-base font-semibold cursor-pointer hover:opacity-80" style={{ color: c.text }} onClick={() => setViewItem(item)}>{item.name}</h3>
                      <VBadge color={item.color}>{item.status}</VBadge>
                    </div>
                    <p className="text-xs lg:text-sm flex items-center gap-1" style={{ color: c.textMuted }}><MapPin size={12} /> {item.location}</p>
                    <p className="text-xs lg:text-sm mt-0.5 flex items-center gap-1" style={{ color: c.textMuted }}><Clock size={12} /> {item.date} · {item.category}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <button type="button"
                        className="flex-1 h-9 lg:h-10 rounded-xl text-xs lg:text-sm font-medium border bg-white flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                        style={{ borderColor: c.border, color: c.textMuted }}
                        onClick={() => setViewItem(item)}>
                        <Eye size={13} /> View Details
                      </button>
                      <button type="button"
                        className="flex-1 h-9 lg:h-10 rounded-xl text-xs lg:text-sm font-semibold transition-all duration-200 cursor-pointer"
                        style={{ backgroundColor: c.primary, color: "#fff" }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.primaryDark; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.primary; }}
                        onClick={() => router.push("/dashboard/student/search")}>
                        Claim
                      </button>
                    </div>
                  </VCard>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <VCard className="p-4 lg:p-5 mt-11">
                <div className="flex items-center justify-between mb-3">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>Quick Actions</h2>
                  <PlusCircle size={14} style={{ color: c.textMuted }} />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {quickActions.map((action) => (
                    <button key={action.label} type="button"
                      className="flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-all duration-200 h-32 cursor-pointer"
                      style={{ backgroundColor: c.borderLight, color: c.textMuted }}
                      onMouseEnter={(e) => { if (action.path) { e.currentTarget.style.backgroundColor = c.border; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.borderLight; }}
                      onClick={() => action.path && router.push(action.path)}>
                      <action.icon size={16} style={{ color: c.primary }} />
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </VCard>
              {/* My Claims */}
              <VCard className="p-5 lg:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={f.sectionTitle} style={{ color: c.text }}>My Claims</h2>
                  <FileText size={16} style={{ color: c.textMuted }} />
                </div>
                <div className="space-y-3">
                  {myClaims.map((claim) => (
                    <div key={claim.item} className="flex items-center justify-between p-2.5 lg:p-3 rounded-xl transition-colors duration-200"
                      style={{ backgroundColor: c.borderLight }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm lg:text-base font-medium truncate" style={{ color: c.text }}>{claim.item}</p>
                      </div>
                      <VBadge color={claim.statusColor} className="ml-2 shrink-0">{claim.status}</VBadge>
                    </div>
                  ))}
                </div>
              </VCard>
            </div>
          </div>

          {/* Announcements */}
          <VCard className="p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className={f.sectionTitle} style={{ color: c.text }}>Announcements</h2>
              <BellRing size={16} style={{ color: c.textMuted }} />
            </div>
            <div className="divide-y" style={{ borderColor: c.border }}>
              {announcements.map((a) => (
                <div key={a.title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: c.borderLight }}>
                    <a.icon size={16} style={{ color: c.primary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: c.text }}>{a.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: c.textMuted }}>{a.desc}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: c.textMuted }}>{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </VCard>
        </div>
      </main>

      {viewItem && (
        <ItemDetailsModal
          title={viewItem.name}
          statusLabel={viewItem.status}
          statusColor={viewItem.color}
          category={viewItem.category}
          location={viewItem.location}
          date={viewItem.date}
          description={viewItem.description}
          onClose={() => setViewItem(null)}
          footer={<>
            <VButton variant="secondary" className="flex-1" onClick={() => setViewItem(null)}>Close</VButton>
            <VButton className="flex-1" onClick={() => { setViewItem(null); router.push("/dashboard/student/search"); }}>Go to Claim</VButton>
          </>}
        />
      )}
    </StudentShell>
  );
}