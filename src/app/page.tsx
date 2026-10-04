import { Search, Bell, PackageSearch, CircleCheck, CircleAlert, TabletSmartphone, Plus, MapPin, Clock, ArrowRight } from "lucide-react";
import { VCard, VButton, VBadge, vcolors as c, font as f } from "@/components/ui/vault";

const stats = [
  { label: "Lost Items", value: 24, icon: CircleAlert, color: "#f97316", bg: "#fff7ed" },
  { label: "Found Items", value: 18, icon: PackageSearch, color: "#22c55e", bg: "#f0fdf4" },
  { label: "Pending Claims", value: 7, icon: Clock, color: "#f59e0b", bg: "#fffbeb" },
  { label: "Available Lockers", value: 12, icon: TabletSmartphone, color: c.primary, bg: c.borderLight },
];

const categories = [
  { name: "Electronics", icon: TabletSmartphone, count: 6 },
  { name: "Accessories", icon: PackageSearch, count: 4 },
  { name: "Documents", icon: CircleCheck, count: 3 },
  { name: "Others", icon: CircleAlert, count: 5 },
];

const recentItems = [
  { title: "iPhone 15 Pro", location: "Library, 3rd Floor", date: "2 hours ago", status: "Pending" as const },
  { title: "Brown Wallet", location: "Cafe B", date: "5 hours ago", status: "Claimed" as const },
  { title: "Water Bottle", location: "Gym", date: "1 day ago", status: "Retrieved" as const },
];

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: c.bg }}>
      <header className="bg-white border-b sticky top-0 z-50" style={{ borderColor: c.borderLight }}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/vaultQ-removebg-preview.png" alt="" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl" style={{ color: c.text }}>VaultQ</span>
          </div>
          <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" size={18} style={{ color: c.primary }} />
              <input
                className={`w-full pl-10 pr-4 py-2.5 text-sm bg-white rounded-xl border transition-shadow duration-200`}
                style={{ borderColor: c.border, color: c.text, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                placeholder="Search found items..."
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200 cursor-pointer"
              style={{ backgroundColor: c.borderLight }}>
              <Bell size={18} style={{ color: c.primary }} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white cursor-pointer"
              style={{ backgroundColor: c.primary }}>
              JD
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className={f.pageTitle} style={{ color: c.text }}>Lost & Found Dashboard</h1>
          <p className="mt-1" style={{ color: c.primary }}>Track and manage lost items across campus</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <VCard key={stat.label} className="transition-shadow duration-200 hover:shadow-md">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm mb-1" style={{ color: c.primary }}>{stat.label}</p>
                      <p className="text-3xl font-bold" style={{ color: c.text }}>{stat.value}</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ backgroundColor: stat.bg }}>
                      <Icon className="w-5 h-5" style={{ color: stat.color }} />
                    </div>
                  </div>
                </div>
              </VCard>
            );
          })}
        </div>

        <h2 className={`${f.sectionTitle} mb-4`} style={{ color: c.text }}>Categories</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <VCard key={cat.name} className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
                <div className="p-5 flex items-center gap-4">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: c.borderLight }}>
                    <Icon className="w-5 h-5" style={{ color: c.primary }} />
                  </div>
                  <div>
                    <p className="font-medium" style={{ color: c.text }}>{cat.name}</p>
                    <p className="text-sm" style={{ color: c.accent }}>{cat.count} items</p>
                  </div>
                </div>
              </VCard>
            );
          })}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className={`${f.sectionTitle}`} style={{ color: c.text }}>Recent Found Items</h2>
          <VButton variant="ghost" className="!bg-transparent">
            View All <ArrowRight size={16} />
          </VButton>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {recentItems.map((item) => (
            <VCard key={item.title} className="transition-all duration-200 hover:shadow-md overflow-hidden">
              <div className="h-40 flex items-center justify-center" style={{ backgroundColor: c.borderLight }}>
                <PackageSearch className="w-12 h-12" style={{ color: c.accent }} />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold" style={{ color: c.text }}>{item.title}</h3>
                  <VBadge color={item.status === "Pending" ? "#f59e0b" : item.status === "Claimed" ? "#3b82f6" : "#16a34a"}>
                    {item.status}
                  </VBadge>
                </div>
                <div className="flex items-center gap-1 text-sm mb-1" style={{ color: c.accent }}>
                  <MapPin size={14} style={{ color: c.primary }} /> {item.location}
                </div>
                <div className="flex items-center gap-1 text-sm mb-4" style={{ color: c.primary }}>
                  <Clock size={14} /> {item.date}
                </div>
                <VButton className="w-full">View Details</VButton>
              </div>
            </VCard>
          ))}
        </div>
      </main>

      <button className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center z-50 cursor-pointer"
        style={{ backgroundColor: c.primary }}>
        <Plus className="w-6 h-6 text-white" />
      </button>
    </div>
  );
}