"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FileText, Briefcase, CreditCard, Key, BookText, CupSoda,
  ChevronDown, Home, PlusCircle, BellRing, User,
  Monitor, Grid3X3, Camera, AlertCircle, CheckCircle2, PackageSearch, PackageCheck
} from "lucide-react";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VButton, VInput, VTextarea, VDropdown, VDropdownItem,
  vcolors as c, font as f
} from "@/components/ui/vault";

interface User {
  name: string;
  role: string;
}

const categories = [
  { label: "Electronics", icon: Monitor, color: "#355C8A" },
  { label: "Bags", icon: Briefcase, color: "#29486A" },
  { label: "Student Cards", icon: CreditCard, color: "#7FB8B5" },
  { label: "Keys", icon: Key, color: "#355C8A" },
  { label: "Documents", icon: BookText, color: "#29486A" },
  { label: "Water Bottles", icon: CupSoda, color: "#7FB8B5" },
  { label: "Others", icon: Grid3X3, color: "#355C8A" },
];

export default function StudentReport() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  const [type, setType] = useState<"lost" | "found" | null>(null);
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [contact, setContact] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      setUser({ name: "Student User", role: "STUDENT" });
    } else {
      setUser(JSON.parse(stored));
    }
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("type");
      if (t === "found" || t === "lost") setType(t);
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1");
  }

  function selectType(t: "lost" | "found") {
    setType(t);
    router.push(`/dashboard/student/report?type=${t}`);
  }

  if (!user || !mounted) return null;

  const today = new Date().toISOString().slice(0, 10);
  const formValid = !!(type && itemName.trim() && category && location.trim() && date);

  function handleSubmit() {
    if (!formValid) return;
    setSubmitted(true);
  }

  return (
    <StudentShell active="Report" userName={user.name} userRole={user.role} pageTitle="Report an Item" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col items-center">
          {submitted ? (
            <VCard className="p-10 lg:p-12 text-center flex-1 flex flex-col items-center justify-center w-full max-w-3xl mx-auto">
              <CheckCircle2 size={56} className="mx-auto mb-5" style={{ color: c.accent }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: c.text }}>Report Submitted</h2>
              <p className="text-base mb-8" style={{ color: c.textMuted }}>
                Your {type === "lost" ? "lost item" : "found item"} report has been received. We&apos;ll notify you when there is an update.
              </p>
              <div className="flex items-center justify-center gap-4">
                <VButton variant="secondary" size="lg"
                  onClick={() => { setSubmitted(false); setItemName(""); setCategory(null); setDescription(""); setLocation(""); setDate(""); setContact(""); }}>
                  Report Another
                </VButton>
                <VButton size="lg" onClick={() => router.push("/dashboard/student")}>Back to Home</VButton>
              </div>
            </VCard>
          ) : !type ? (
            <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-center py-8">
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold mb-2" style={{ color: c.text }}>What would you like to report?</h2>
                <p className="text-sm" style={{ color: c.textMuted }}>Choose the type of report to continue.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <button type="button" onClick={() => selectType("lost")}
                  className="group text-left p-6 lg:p-8 rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg cursor-pointer"
                  style={{ borderColor: c.border }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors duration-200"
                    style={{ backgroundColor: `${c.primary}15` }}>
                    <PackageSearch size={24} style={{ color: c.primary }} />
                  </div>
                  <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Lost Item</h3>
                  <p className="text-sm mb-5" style={{ color: c.textMuted }}>I lost something on campus and need help finding it.</p>
                  <span className="inline-flex items-center justify-center h-9 px-4 rounded-xl text-sm font-semibold text-white transition-colors duration-200"
                    style={{ backgroundColor: c.primary }}>
                    Report Lost Item
                  </span>
                </button>
                <button type="button" onClick={() => selectType("found")}
                  className="group text-left p-6 lg:p-8 rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg cursor-pointer"
                  style={{ borderColor: c.border }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${c.accent}18` }}>
                    <PackageCheck size={24} style={{ color: c.accent }} />
                  </div>
                  <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Found Item</h3>
                  <p className="text-sm mb-5" style={{ color: c.textMuted }}>I found an item and want to help return it.</p>
                  <span className="inline-flex items-center justify-center h-9 px-4 rounded-xl text-sm font-semibold text-white transition-colors duration-200"
                    style={{ backgroundColor: c.accent }}>
                    Report Found Item
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <VCard className="p-8 lg:p-10 flex-1 flex flex-col w-full max-w-3xl mx-auto">

              {/* Selected type indicator */}
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: c.textMuted }}>
                  Reporting: <span style={{ color: c.primary }}>{type === "lost" ? "Lost Item" : "Found Item"}</span>
                </p>
                <button type="button"
                  className="text-xs font-semibold underline transition-opacity duration-200 hover:opacity-70 cursor-pointer"
                  style={{ color: c.primary }}
                  onClick={() => { setType(null); router.push("/dashboard/student/report"); }}>
                  Change
                </button>
              </div>

              {/* Section: Item Information */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: c.textMuted }}>Item information</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                      Item name <span style={{ color: c.danger }}>*</span>
                    </label>
                    <VInput value={itemName} onChange={(e) => setItemName(e.target.value)}
                      placeholder={type === "lost" ? "e.g. Black Adidas backpack" : "e.g. Silver Samsung phone"} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                        Category <span style={{ color: c.danger }}>*</span>
                      </label>
                      <VDropdown
                        open={categoryOpen}
                        onOpenChange={setCategoryOpen}
                        width="w-full"
                        trigger={
                          <button type="button"
                            className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm font-medium border bg-white transition-shadow duration-200 text-left cursor-pointer relative"
                            style={{ borderColor: c.border, color: category ? c.text : c.textMuted }}
                            onClick={() => setCategoryOpen(!categoryOpen)}>
                            {category ? (
                              <>{(() => { const cc = categories.find(c => c.label === category); return cc ? <cc.icon size={15} style={{ color: cc.color }} /> : null; })()}<span>{category}</span></>
                            ) : (
                              <>Select a category</>
                            )}
                            <ChevronDown size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textMuted }} />
                          </button>
                        }
                      >
                        {(close) => (
                          <>
                            {categories.map((cat) => (
                              <VDropdownItem key={cat.label} active={category === cat.label}
                                onSelect={() => { setCategory(cat.label); close(); }}>
                                <cat.icon size={15} style={{ color: cat.color }} />
                                {cat.label}
                              </VDropdownItem>
                            ))}
                          </>
                        )}
                      </VDropdown>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                        Date <span style={{ color: c.danger }}>*</span>
                      </label>
                      <VInput type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Location & Contact */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: c.textMuted }}>Location &amp; contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                      {type === "lost" ? "Last seen location" : "Found location"} <span style={{ color: c.danger }}>*</span>
                    </label>
                    <VInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Library 3rd Floor" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Contact number</label>
                    <VInput type="tel" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. 012-3456789" />
                  </div>
                </div>
              </div>

              {/* Section: Description & Photo */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: c.textMuted }}>Description &amp; photo</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Description</label>
                    <VTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                      placeholder="Provide details like color, brand, distinguishing features..." />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Photo</label>
                    <button type="button"
                      className="w-full h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                      style={{ borderColor: c.border, color: c.textMuted, backgroundColor: c.fill }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; e.currentTarget.style.color = c.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textMuted; }}>
                      <Camera size={20} />
                      <span className="text-xs font-medium">Upload a photo</span>
                      <span className="text-[11px]" style={{ color: c.textLight }}>Optional</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: c.borderLight }}>
                <VButton variant="secondary" size="lg" onClick={() => router.push("/dashboard/student")}>Cancel</VButton>
                <VButton size="lg" onClick={handleSubmit} disabled={!formValid}>
                  <AlertCircle size={15} /> Submit Report
                </VButton>
              </div>
            </VCard>
          )}
        </div>
      </main>
    </StudentShell>
  );
}
