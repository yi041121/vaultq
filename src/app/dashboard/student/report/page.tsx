"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PackageSearch, PackageCheck, MapPin, Clock, Camera, X, CheckCircle2,
  AlertCircle, Loader2, RefreshCw, Plus, ArrowRight, FileText,
  Monitor, Briefcase, CreditCard, Key, BookText, CupSoda, Grid3X3,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StudentShell } from "@/components/student-shell";
import {
  VCard, VButton, VInput, VTextarea, VDropdown, VDropdownItem, VBadge, vcolors as c,
} from "@/components/ui/vault";
import { ITEM_CATEGORIES } from "@/lib/categories";
import { mapReport, type UserReport } from "@/lib/report-mapper";

interface User { id: string; name: string; email: string; role: string; }
type ReportType = "LOST" | "FOUND";

const categoryIcons: Record<string, any> = {
  Electronics: Monitor,
  Bags: Briefcase,
  "Student Cards": CreditCard,
  Keys: Key,
  Documents: BookText,
  "Water Bottles": CupSoda,
  Others: Grid3X3,
};

const typeColor: Record<ReportType, string> = { LOST: "#355C8A", FOUND: "#7FB8B5" };

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
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<ReportType | null>(null);

  const [reports, setReports] = useState<UserReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<UserReport | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const formValid = !!(
    type && itemName.trim().length >= 2 && category && description.trim().length >= 5 &&
    location.trim().length >= 2 && date
  );

  async function loadReports(token: string) {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const res = await fetch("/api/reports", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load reports");
      setReports((data.data as any[]).map(mapReport));
    } catch (e) {
      setReportsError(e instanceof Error ? e.message : "Failed to load reports");
      setReports([]);
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

  function handleLogout() {
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
    setPhoto(null);
    setPreview(null);
  }

  function selectType(next: ReportType) {
    setType(next);
    setSubmitted(null);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showCenteredMessage("error", "Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showCenteredMessage("error", "Image must be under 5MB");
      return;
    }
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!type) return;
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
      if (photo) form.append("photo", photo);

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

  if (!user || !mounted) return null;

  return (
    <StudentShell active="Report" userName={user.name} userRole={user.role} pageTitle="Report" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col items-center">
          {/* Tabs */}
          <div className="w-full max-w-3xl mx-auto flex rounded-xl border bg-white overflow-hidden mb-6" style={{ borderColor: c.border }}>
            <button type="button"
              className="flex-1 h-10 text-xs font-semibold transition-all duration-150 cursor-pointer"
              style={{ backgroundColor: tab === "new" ? c.primary : "transparent", color: tab === "new" ? "#fff" : c.textMuted }}
              onClick={() => setTab("new")}>
              New report
            </button>
            <button type="button"
              className="flex-1 h-10 text-xs font-semibold transition-all duration-150 cursor-pointer"
              style={{ backgroundColor: tab === "reports" ? c.primary : "transparent", color: tab === "reports" ? "#fff" : c.textMuted }}
              onClick={() => setTab("reports")}>
              My reports{reports.length > 0 ? ` (${reports.length})` : ""}
            </button>
          </div>

          {tab === "reports" ? (
            <div className="w-full max-w-3xl mx-auto flex-1">
              {reportsLoading ? (
                <VCard className="py-20 text-center flex flex-col items-center justify-center">
                  <Loader2 size={32} className="animate-spin mb-4" style={{ color: c.primary }} />
                  <p className="text-base font-medium" style={{ color: c.textMuted }}>Loading your reports...</p>
                </VCard>
              ) : reportsError ? (
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
                  <VButton onClick={() => setTab("new")}><Plus size={14} /> New report</VButton>
                </VCard>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => {
                    const Icon = categoryIcons[report.category] || FileText;
                    const canClaim = report.type === "LOST" && report.status === "MATCHED" && report.item?.status === "FOUND";
                    return (
                      <VCard key={report.id} className="p-5 lg:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${typeColor[report.type]}15` }}>
                              <Icon size={20} style={{ color: typeColor[report.type] }} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold truncate" style={{ color: c.text }}>{report.itemName}</h3>
                              <p className="text-[11px] mt-0.5" style={{ color: c.textLight }}>
                                {report.reference} · {report.typeLabel} · {fmtTimestamp(report.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <VBadge color={typeColor[report.type]}>{report.typeLabel}</VBadge>
                            <VBadge color={report.color}>{report.statusLabel}</VBadge>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs mb-3" style={{ color: c.textMuted }}>
                          <span className="flex items-center gap-1"><MapPin size={12} /> {report.location || "—"}</span>
                          <span className="flex items-center gap-1"><Clock size={12} /> {fmtDay(report.date)}</span>
                          <span>{report.category}</span>
                        </div>

                        <p className="text-sm leading-relaxed mb-3" style={{ color: c.textMuted }}>{report.description}</p>

                        {report.imageUrl && (
                          <img src={report.imageUrl} alt={report.itemName}
                            className="w-full h-40 object-cover rounded-xl border mb-3" style={{ borderColor: c.border }} />
                        )}

                        {report.adminNote && (
                          <div className="rounded-xl p-3 mb-3 text-xs" style={{ backgroundColor: "#fef2f2", color: c.danger }}>
                            <span className="font-semibold">Admin note: </span>{report.adminNote}
                          </div>
                        )}

                        {report.item && (
                          <div className="rounded-xl p-3.5 mb-3 flex flex-wrap items-center gap-3" style={{ backgroundColor: c.fill }}>
                            {report.item.imageUrl ? (
                              <img src={report.item.imageUrl} alt={report.item.name} className="w-12 h-12 rounded-lg object-cover border" style={{ borderColor: c.border }} />
                            ) : (
                              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.borderLight }}>
                                <Icon size={20} style={{ color: c.primary }} />
                              </div>
                            )}
                            <div className="flex-1 min-w-[160px]">
                              <p className="text-xs font-semibold" style={{ color: c.text }}>
                                {report.type === "LOST" ? "Matched item" : "Logged item"}: {report.item.name}
                              </p>
                              <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: c.textMuted }}>
                                {report.item.status}
                              </p>
                            </div>
                            {canClaim && (
                              <VButton size="sm" onClick={() => router.push(`/dashboard/student/search?item=${report.item!.id}`)}>
                                View item &amp; claim <ArrowRight size={13} />
                              </VButton>
                            )}
                          </div>
                        )}

                        {report.type === "FOUND" && report.status === "PENDING" && (
                          <p className="text-[11px] mb-3 p-2.5 rounded-lg" style={{ backgroundColor: c.primarySoft, color: c.primary }}>
                            Please hand this item to the Lost &amp; Found office. An admin will verify it and assign a locker.
                          </p>
                        )}

                        {report.status === "PENDING" && (
                          <div className="flex justify-end">
                            <VButton variant="danger" size="sm" onClick={() => setWithdrawTarget(report)}>
                              Withdraw report
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
                    <VButton size="lg" onClick={() => { setSubmitted(null); setTab("reports"); }}>
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
                      className="group text-left p-6 lg:p-8 rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg cursor-pointer"
                      style={{ borderColor: c.border }}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${c.primary}15` }}>
                        <PackageSearch size={24} style={{ color: c.primary }} />
                      </div>
                      <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Lost Item</h3>
                      <p className="text-sm mb-5" style={{ color: c.textMuted }}>I lost something on campus and need help finding it.</p>
                      <span className="inline-flex items-center justify-center h-9 px-4 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: c.primary }}>
                        Report Lost Item
                      </span>
                    </button>
                    <button type="button" onClick={() => selectType("FOUND")}
                      className="group text-left p-6 lg:p-8 rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg cursor-pointer"
                      style={{ borderColor: c.border }}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${c.accent}18` }}>
                        <PackageCheck size={24} style={{ color: c.accent }} />
                      </div>
                      <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Found Item</h3>
                      <p className="text-sm mb-5" style={{ color: c.textMuted }}>I found an item and want to hand it in.</p>
                      <span className="inline-flex items-center justify-center h-9 px-4 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: c.accent }}>
                        Report Found Item
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <VCard className="p-8 lg:p-10 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-xl lg:text-2xl font-bold tracking-tight" style={{ color: c.text }}>
                      Reporting: <span style={{ color: typeColor[type] }}>{type === "LOST" ? "Lost Item" : "Found Item"}</span>
                    </p>
                    <button type="button" className="text-xs font-semibold underline hover:opacity-70 cursor-pointer" style={{ color: c.primary }}
                      onClick={() => { setType(null); resetForm(); }}>
                      Change
                    </button>
                  </div>

                  {type === "FOUND" && (
                    <div className="rounded-xl p-3.5 mb-5 text-xs leading-relaxed flex gap-2" style={{ backgroundColor: `${c.accent}12`, color: c.textMuted }}>
                      <PackageCheck size={16} className="shrink-0 mt-0.5" style={{ color: c.accent }} />
                      <span>After submitting, hand the item to the Lost &amp; Found office. An admin will verify it and assign a locker before it appears in Search.</span>
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
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                            Category <span style={{ color: c.danger }}>*</span>
                          </label>
                          <VDropdown open={categoryOpen} onOpenChange={setCategoryOpen} width="w-full"
                            trigger={
                              <button type="button"
                                className="flex items-center gap-2 w-full h-11 pl-3.5 pr-10 rounded-xl text-sm font-medium border bg-white text-left cursor-pointer relative"
                                style={{ borderColor: c.border, color: category ? c.text : c.textMuted }}
                                onClick={() => setCategoryOpen(!categoryOpen)}>
                                {category
                                  ? <>{(() => { const Icon = categoryIcons[category] || Grid3X3; return <Icon size={15} style={{ color: c.primary }} />; })()}<span>{category}</span></>
                                  : <span>Select a category</span>}
                                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs" style={{ color: c.textMuted }}>▾</span>
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
                        <div>
                          <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                            {type === "LOST" ? "Date lost" : "Date found"} <span style={{ color: c.danger }}>*</span>
                          </label>
                          <VInput type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
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
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                          Description <span style={{ color: c.danger }}>*</span>
                        </label>
                        <VTextarea value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} rows={3}
                          placeholder="Provide details like color, brand and distinguishing features..." />
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: c.textMuted }}>Photo</p>
                    <input id="report-photo" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    {preview ? (
                      <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                        <img src={preview} alt="Report preview" className="w-full h-48 object-cover" />
                        <button type="button" onClick={() => { setPhoto(null); setPreview(null); }}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button type="button"
                        className="w-full h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer"
                        style={{ borderColor: c.border, color: c.textMuted, backgroundColor: c.fill }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; e.currentTarget.style.color = c.primary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textMuted; }}
                        onClick={() => document.getElementById("report-photo")?.click()}>
                        <Camera size={20} />
                        <span className="text-xs font-medium">Upload a photo</span>
                        <span className="text-[11px]" style={{ color: c.textLight }}>Optional · JPG, PNG up to 5MB</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t mt-auto" style={{ borderColor: c.borderLight }}>
                    <VButton variant="secondary" size="lg" onClick={() => router.push("/dashboard/student")}>Cancel</VButton>
                    <VButton size="lg" onClick={handleSubmit} disabled={!formValid || submitting}>
                      {submitting ? <Loader2 size={15} className="animate-spin" /> : <AlertCircle size={15} />}
                      {submitting ? "Submitting..." : "Submit Report"}
                    </VButton>
                  </div>
                </VCard>
              )}
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={!!withdrawTarget}
        title="Withdraw this report?"
        subtitle={withdrawTarget ? `${withdrawTarget.itemName} · ${withdrawTarget.reference}` : undefined}
        cancelLabel="Keep report"
        confirmLabel={withdrawing ? "Withdrawing..." : "Withdraw"}
        onCancel={() => { if (!withdrawing) setWithdrawTarget(null); }}
        onConfirm={handleWithdraw}
      />
    </StudentShell>
  );
}
