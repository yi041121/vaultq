"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Package, Grid3X3, Lock, FileText, Users, Search, Plus, X, Barcode, Mail, GraduationCap, Trash2, AlertTriangle, SquarePen, PackageSearch, Upload, Loader2 } from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { decodeBarcodeFromImage } from "@/lib/barcode-decode";
import { StudentShell } from "@/components/student-shell";
import { FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { VCard, VBadge, VButton, VInput, VSearchInput, VPagination, vcolors as c } from "@/components/ui/vault";
import { getPersonNameError, sanitizePersonNameInput, NAME_MAX_LENGTH } from "@/lib/person-name";
import { isValidStudentId, STUDENT_ID_ERROR_MESSAGE, STUDENT_ID_MAX_LENGTH } from "@/lib/student-id";
import { matchesSearch } from "@/lib/search";

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Intake", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

type Student = {
  id: string;
  name: string;
  email: string;
  role: string;
  studentId: string;
  cardBarcode: string | null;
  status: "ACTIVE" | "DISABLED";
  claims: number;
};

const initialStudents: Student[] = [
  { id: "1", name: "Alex Tan", email: "alex.tan@student.edu", role: "STUDENT", studentId: "S12345", cardBarcode: "2000132602", status: "ACTIVE", claims: 2 },
  { id: "2", name: "Sarah Lim", email: "sarah.lim@student.edu", role: "STUDENT", studentId: "S12346", cardBarcode: "2000133175", status: "ACTIVE", claims: 1 },
  { id: "3", name: "John Doe", email: "john.doe@student.edu", role: "STUDENT", studentId: "S12347", cardBarcode: null, status: "ACTIVE", claims: 1 },
  { id: "4", name: "Emily Chen", email: "emily.chen@student.edu", role: "STUDENT", studentId: "S12348", cardBarcode: "2000133301", status: "ACTIVE", claims: 0 },
  { id: "5", name: "Mike Lee", email: "mike.lee@student.edu", role: "STUDENT", studentId: "S12349", cardBarcode: null, status: "DISABLED", claims: 1 },
  { id: "6", name: "Lisa Wong", email: "lisa.wong@student.edu", role: "STUDENT", studentId: "S12350", cardBarcode: "2000133412", status: "ACTIVE", claims: 0 },
];

const statusOptions = ["All", "HAS_CLAIMS", "NO_CLAIMS", "NO_BARCODE"] as const;

// Keeps the last loaded list so revisiting the page renders instantly instead
// of flashing the loading state on every navigation.
let accountsCache: Student[] | null = null;
let accountsCacheLive = false;

function maskedBarcode(code: string) {
  return `•••••${code.slice(-4)}`;
}

export default function AdminAccounts() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [students, setStudents] = useState<Student[]>(accountsCache ?? initialStudents);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<typeof statusOptions[number]>("All");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formStudentId, setFormStudentId] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [barcodeReading, setBarcodeReading] = useState(false);
  const barcodeFileRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStudentId, setEditStudentId] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiLive, setApiLive] = useState(accountsCacheLive);

  function authHeaders(): Record<string, string> {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function mapApiUser(raw: any): Student {
    return {
      id: raw.id,
      name: raw.name,
      email: raw.email,
      role: raw.role || "STUDENT",
      studentId: raw.studentId || raw.adminId || "—",
      cardBarcode: raw.cardBarcode || null,
      status: raw.isActive === false ? "DISABLED" : "ACTIVE",
      claims: raw._count?.claims ?? 0,
    };
  }

  /** Exact duplicate check against the database (not just the loaded page). */
  async function findAccountBy(field: "cardBarcode" | "studentId" | "email", value: string) {
    try {
      const res = await fetch(`/api/accounts?q=${encodeURIComponent(value)}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      if (!data?.success || !Array.isArray(data.data)) return null;
      return (data.data as any[]).find((u) => {
        if (field === "cardBarcode") return u.cardBarcode === value;
        if (field === "studentId") return String(u.studentId || "").toUpperCase() === value.toUpperCase();
        return String(u.email || "").toLowerCase() === value.toLowerCase();
      }) || null;
    } catch {
      // Fall through to the server-side duplicate check on submit.
      return null;
    }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load accounts");
      // Admin accounts never appear on this page
      const list = (data.data || [])
        .filter((u: any) => (u.role || "STUDENT") !== "ADMIN")
        .map(mapApiUser);
      setStudents(list);
      setApiLive(true);
      accountsCache = list;
      accountsCacheLive = true;
    } catch (e: any) {
      console.warn("Accounts API unreachable, using mock data:", e?.message);
      if (!accountsCache) {
        setStudents(initialStudents);
        setApiLive(false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
    fetchAccounts();
  }, []);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/login?skip=1&loggedOut=1"); }
  if (!user || !mounted) return null;

  const filtered = students.filter((st) => {
    if (!matchesSearch(query, [st.name, st.email, st.studentId, st.cardBarcode, st.status, st.role])) return false;
    if (statusFilter === "HAS_CLAIMS" && st.claims === 0) return false;
    if (statusFilter === "NO_CLAIMS" && st.claims > 0) return false;
    if (statusFilter === "NO_BARCODE" && st.cardBarcode) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = !!(query || statusFilter !== "All");

  function openAdd() {
    setFormName(""); setFormEmail(""); setFormStudentId(""); setFormBarcode(""); setFormPassword(""); setFormError(null);
    setShowModal(true);
  }

  async function handleBarcodeImage(event: React.ChangeEvent<HTMLInputElement>, mode: "add" | "edit") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showCenteredMessage("error", "Please upload an image of the card barcode");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showCenteredMessage("error", "Barcode image must be under 5MB");
      return;
    }
    setBarcodeReading(true);
    try {
      const code = await decodeBarcodeFromImage(file);
      if (!code) {
        showCenteredMessage("error", "Could not detect the barcode — type the 10 digits manually");
        return;
      }
      if (mode === "add") setFormBarcode(code);
      else setEditBarcode(code);
      setFormError(null);
      setEditError(null);
      showCenteredMessage("success", "Barcode detected from card photo");
    } finally {
      setBarcodeReading(false);
    }
  }

  async function handleAdd() {
    if (!formName.trim() || !formEmail.trim()) {
      setFormError("Name and email are required");
      showCenteredMessage("error", "Please fill required fields");
      return;
    }
    const nameError = getPersonNameError(formName);
    if (nameError) {
      setFormError(nameError);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail.trim())) {
      setFormError("Invalid email format");
      return;
    }
    if (!formEmail.trim().toLowerCase().endsWith("@student.tarc.edu.my")) {
      setFormError("Student email must be a valid @student.tarc.edu.my address");
      return;
    }
    if (!formBarcode) {
      setFormError("Card barcode is required");
      showCenteredMessage("error", "Please enter the 10-digit card barcode");
      return;
    }
    if (!/^[0-9]{10}$/.test(formBarcode)) {
      setFormError("Barcode must be exactly 10 digits (e.g. 2000132602)");
      return;
    }
    if (formStudentId.trim() && !isValidStudentId(formStudentId)) {
      setFormError(STUDENT_ID_ERROR_MESSAGE);
      return;
    }
    if (!formPassword || formPassword.length < 8) {
      setFormError("Temporary password must be at least 8 characters");
      return;
    }
    if (!apiLive) {
      if (students.some((s) => s.email.toLowerCase() === formEmail.trim().toLowerCase())) {
        setFormError("Email already registered");
        return;
      }
      if (students.some((s) => s.cardBarcode === formBarcode)) {
        setFormError("Barcode already registered");
        return;
      }
      if (formStudentId.trim() && students.some((s) => s.studentId.toUpperCase() === formStudentId.trim().toUpperCase())) {
        setFormError("Student ID already registered");
        return;
      }
      const newStudent: Student = {
        id: String(Date.now()),
        name: formName.trim(),
        email: formEmail.trim(),
        role: "STUDENT",
        studentId: formStudentId.trim() || "—",
        cardBarcode: formBarcode,
        status: "ACTIVE",
        claims: 0,
      };
      setStudents([newStudent, ...students]);
      setShowModal(false);
      showCenteredMessage("success", `Account created for ${newStudent.name}`);
      return;
    }
    setSaving(true);
    try {
      const barcodeOwner = await findAccountBy("cardBarcode", formBarcode);
      if (barcodeOwner) {
        setFormError("Barcode already registered");
        showCenteredMessage("error", "This card barcode is already assigned to another account");
        return;
      }
      if (formStudentId.trim()) {
        const studentIdOwner = await findAccountBy("studentId", formStudentId.trim());
        if (studentIdOwner) {
          setFormError("Student ID already registered");
          showCenteredMessage("error", "This student ID is already assigned to another account");
          return;
        }
      }
      const emailOwner = await findAccountBy("email", formEmail.trim());
      if (emailOwner) {
        setFormError("Email already registered");
        showCenteredMessage("error", "This email is already assigned to another account");
        return;
      }
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          studentId: formStudentId.trim() || null,
          cardBarcode: formBarcode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create account");
      setShowModal(false);
      showCenteredMessage("success", `Account created for ${formName.trim()}`);
      await fetchAccounts();
    } catch (e: any) {
      setFormError(e?.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editName.trim() || !editEmail.trim()) {
      setEditError("Name and email are required");
      return;
    }
    const nameError = getPersonNameError(editName);
    if (nameError) {
      setEditError(nameError);
      return;
    }
    if (editStudentId.trim() && !isValidStudentId(editStudentId)) {
      setEditError(STUDENT_ID_ERROR_MESSAGE);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail.trim()) || !editEmail.trim().toLowerCase().endsWith("@student.tarc.edu.my")) {
      setEditError("Student email must be a valid @student.tarc.edu.my address");
      return;
    }
    if (!editBarcode) {
      setEditError("Card barcode is required");
      return;
    }
    if (!/^[0-9]{10}$/.test(editBarcode)) {
      setEditError("Barcode must be exactly 10 digits (e.g. 2000132602)");
      return;
    }
    if (!apiLive) {
      if (students.some((s) => s.id !== editTarget.id && s.email.toLowerCase() === editEmail.trim().toLowerCase())) {
        setEditError("Email already registered");
        return;
      }
      if (students.some((s) => s.id !== editTarget.id && s.cardBarcode === editBarcode)) {
        setEditError("Barcode already registered");
        return;
      }
      if (editStudentId.trim() && students.some((s) => s.id !== editTarget.id && s.studentId.toUpperCase() === editStudentId.trim().toUpperCase())) {
        setEditError("Student ID already registered");
        return;
      }
      setStudents(students.map((s) => s.id === editTarget.id ? { ...s, name: editName.trim(), email: editEmail.trim(), studentId: editStudentId.trim() || "—", cardBarcode: editBarcode } : s));
      setEditTarget(null);
      showCenteredMessage("success", `${editName.trim()} updated`);
      return;
    }
    setEditSaving(true);
    try {
      const barcodeOwner = await findAccountBy("cardBarcode", editBarcode);
      if (barcodeOwner && barcodeOwner.id !== editTarget.id) {
        setEditError("Barcode already registered");
        showCenteredMessage("error", "This card barcode is already assigned to another account");
        return;
      }
      if (editStudentId.trim()) {
        const studentIdOwner = await findAccountBy("studentId", editStudentId.trim());
        if (studentIdOwner && studentIdOwner.id !== editTarget.id) {
          setEditError("Student ID already registered");
          showCenteredMessage("error", "This student ID is already assigned to another account");
          return;
        }
      }
      const emailOwner = await findAccountBy("email", editEmail.trim());
      if (emailOwner && emailOwner.id !== editTarget.id) {
        setEditError("Email already registered");
        showCenteredMessage("error", "This email is already assigned to another account");
        return;
      }
      const res = await fetch(`/api/accounts/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          studentId: editStudentId.trim() || null,
          cardBarcode: editBarcode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update account");
      showCenteredMessage("success", `${editName.trim()} updated`);
      setEditTarget(null);
      await fetchAccounts();
    } catch (e: any) {
      setEditError(e?.message || "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  function openEdit(st: Student) {
    setEditName(st.name);
    setEditEmail(st.email);
    setEditStudentId(st.studentId === "—" ? "" : st.studentId);
    setEditBarcode(st.cardBarcode || "");
    setEditError(null);
    setEditTarget(st);
  }

  async function handleDelete(st: Student) {
    if (!apiLive) {
      setStudents(students.filter((s) => s.id !== st.id));
      setDeleteTarget(null);
      showCenteredMessage("success", `${st.name} deleted`);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${st.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete account");
      showCenteredMessage("success", `${st.name} deleted`);
      setDeleteTarget(null);
      await fetchAccounts();
    } catch (e: any) {
      setDeleteTarget(null);
      showCenteredMessage("error", e?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <StudentShell active="Accounts" userName={user.name} userRole={user.role} pageTitle="Account Management" bottomNav={adminNav} logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-28 lg:pb-6 flex flex-col">
        <div className="px-4 sm:px-6 lg:px-12 pt-5 lg:pt-6 w-full flex-1 flex flex-col">
          <FilterPanel
            search={
              <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="w-full" placeholder="Search name, email, ID or barcode..." />
            }
            actions={
              <VButton size="md" onClick={openAdd} className="w-full sm:w-auto">
                <Plus size={15} /> Add Student
              </VButton>
            }
            filters={
              <div className="vq-scroll-x flex h-10 rounded-xl border bg-white shrink-0" style={{ borderColor: c.border }}>
                {statusOptions.map((s) => (
                  <button key={s} type="button"
                    className="px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer"
                    style={{ backgroundColor: statusFilter === s ? c.primary : "transparent", color: statusFilter === s ? "#fff" : c.textMuted }}
                    onClick={() => { setStatusFilter(s); setPage(1); }}>
                    {s === "All" ? "All" : s === "NO_BARCODE" ? "No barcode" : s === "HAS_CLAIMS" ? "Has claims" : "No claims"}
                  </button>
                ))}
              </div>
            }
            reset={hasFilters ? (
              <ResetFiltersButton onClick={() => { setQuery(""); setStatusFilter("All"); setPage(1); }} />
            ) : null}
          />

          {loading ? null : filtered.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>No accounts found</p>
              <p className="text-sm mt-1" style={{ color: c.textLight }}>Try adjusting filters or add a student.</p>
            </VCard>
          ) : (
            <>
              <div className="space-y-4 flex-1">
                {paginated.map((st) => (
                  <VCard key={st.id} className="p-5 flex flex-col lg:flex-row lg:items-center gap-4" style={st.status === "DISABLED" ? { opacity: 0.75 } : {}}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold text-white shrink-0"
                      style={{ backgroundColor: st.status === "DISABLED" ? c.textLight : c.primary }}>
                      {st.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold" style={{ color: c.text }}>{st.name}</h3>
                        <VBadge color={st.status === "ACTIVE" ? "#16a34a" : "#64748b"}>{st.status === "ACTIVE" ? "Active" : "Disabled"}</VBadge>
                        {st.cardBarcode ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: "#f0fdf4", color: "#16a34a" }}>
                            <Barcode size={10} /> {maskedBarcode(st.cardBarcode)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: "#fffbeb", color: "#92400e" }}>
                            <Barcode size={10} /> No barcode
                          </span>
                        )}
                        <span className="text-xs" style={{ color: c.textLight }}>{st.studentId} · {st.claims} claim{st.claims !== 1 ? "s" : ""}</span>
                      </div>
                      <p className="text-xs flex items-center gap-1" style={{ color: c.textMuted }}><Mail size={12} /> {st.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {st.role !== "ADMIN" && (
                        <>
                          <VButton variant="secondary" size="md" onClick={() => openEdit(st)}><SquarePen size={14} /> Edit</VButton>
                          <VButton variant="secondary" size="md" onClick={() => setDeleteTarget(st)}><Trash2 size={14} /> Delete</VButton>
                        </>
                      )}
                    </div>
                  </VCard>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-auto pt-6">
                <span className="text-xs" style={{ color: c.textMuted }}>
                  Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} results
                </span>
                <VPagination current={currentPage} total={totalPages} onPage={setPage} />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Add student modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <VCard className="relative w-full max-w-lg p-6 lg:p-7 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Add Student Account</h3>
              <button type="button" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Name <span style={{ color: c.danger }}>*</span></label>
                <VInput value={formName} onChange={(e) => setFormName(sanitizePersonNameInput(e.target.value))} placeholder="e.g. Alex Tan" maxLength={NAME_MAX_LENGTH} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Email <span style={{ color: c.danger }}>*</span></label>
                  <VInput type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="name@student.tarc.edu.my" />
                  <p className="text-[11px] mt-1" style={{ color: c.textLight }}>Students must use @student.tarc.edu.my</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Student ID <span className="text-xs font-normal" style={{ color: c.textMuted }}>(optional)</span></label>
                  <div className="relative">
                    <GraduationCap size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                    <VInput
                      value={formStudentId}
                      onChange={(e) => setFormStudentId(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, STUDENT_ID_MAX_LENGTH))}
                      placeholder="25SMR10180"
                      maxLength={STUDENT_ID_MAX_LENGTH}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Card barcode <span style={{ color: c.danger }}>*</span> <span className="text-xs font-normal" style={{ color: c.textMuted }}>(10 digits — e.g. 2000132602)</span></label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                    <VInput value={formBarcode} onChange={(e) => setFormBarcode(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="2000132602" inputMode="numeric" maxLength={10} className="pl-10" />
                  </div>
                  <label className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 ${barcodeReading ? "cursor-wait opacity-70" : "cursor-pointer hover:bg-[#f1f5f9]"}`}
                    style={{ borderColor: c.border, backgroundColor: "#fff", color: c.primary }} title="Upload a previous card photo">
                    {barcodeReading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <input ref={barcodeFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleBarcodeImage(e, "add")} disabled={barcodeReading} />
                  </label>
                </div>
                <p className="text-[11px] mt-1" style={{ color: c.textLight }}>Identifies the student at the locker; lockers are assigned to items, not to cards. Type the 10 digits or upload a previous card photo.</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Temporary password <span style={{ color: c.danger }}>*</span></label>
                <VInput type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              {formError && (
                <p className="text-xs font-medium p-2.5 rounded-lg" style={{ backgroundColor: "#fef2f2", color: c.danger }}>{formError}</p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <VButton variant="secondary" onClick={() => setShowModal(false)}>Cancel</VButton>
                <VButton onClick={handleAdd} disabled={saving || barcodeReading}><Plus size={14} /> {saving ? "Creating..." : "Create Account"}</VButton>
              </div>
            </div>
          </VCard>
        </div>
      )}

      {/* Single-confirm delete dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <VCard className="relative w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#fef2f2" }}>
              <AlertTriangle size={22} style={{ color: c.danger }} />
            </div>
            <h3 className="text-base font-semibold mb-1" style={{ color: c.text }}>Delete this account?</h3>
            <p className="text-xs mb-5" style={{ color: c.textLight }}>
              Permanently deleted — cannot be recovered.
            </p>
            <div className="flex items-center gap-2">
              <VButton variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</VButton>
              <VButton variant="danger" className="flex-1" disabled={deleting} onClick={() => handleDelete(deleteTarget)}>
                {deleting ? "Deleting..." : "Delete"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {/* Edit student modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEditTarget(null)} />
          <VCard className="relative w-full max-w-lg p-6 lg:p-7 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold" style={{ color: c.text }}>Edit Student Account</h3>
              <button type="button" onClick={() => setEditTarget(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Name <span style={{ color: c.danger }}>*</span></label>
                <VInput value={editName} onChange={(e) => setEditName(sanitizePersonNameInput(e.target.value))} placeholder="e.g. Alex Tan" maxLength={NAME_MAX_LENGTH} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Email <span style={{ color: c.danger }}>*</span></label>
                  <VInput type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="name@student.tarc.edu.my" />
                  <p className="text-[11px] mt-1" style={{ color: c.textLight }}>Students must use @student.tarc.edu.my</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Student ID <span className="text-xs font-normal" style={{ color: c.textMuted }}>(optional)</span></label>
                  <div className="relative">
                    <GraduationCap size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                    <VInput
                      value={editStudentId}
                      onChange={(e) => setEditStudentId(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, STUDENT_ID_MAX_LENGTH))}
                      placeholder="25SMR10180"
                      maxLength={STUDENT_ID_MAX_LENGTH}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Card barcode <span style={{ color: c.danger }}>*</span> <span className="text-xs font-normal" style={{ color: c.textMuted }}>(10 digits — e.g. 2000132602)</span></label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                    <VInput value={editBarcode} onChange={(e) => setEditBarcode(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="2000132602" inputMode="numeric" maxLength={10} className="pl-10" />
                  </div>
                  <label className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 ${barcodeReading ? "cursor-wait opacity-70" : "cursor-pointer hover:bg-[#f1f5f9]"}`}
                    style={{ borderColor: c.border, backgroundColor: "#fff", color: c.primary }} title="Upload a previous card photo">
                    {barcodeReading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <input ref={barcodeFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleBarcodeImage(e, "edit")} disabled={barcodeReading} />
                  </label>
                </div>
                <p className="text-[11px] mt-1" style={{ color: c.textLight }}>Identifies the student at the locker; lockers are assigned to items, not to cards. Type the 10 digits or upload a previous card photo.</p>
              </div>
              {editError && (
                <p className="text-xs font-medium p-2.5 rounded-lg" style={{ backgroundColor: "#fef2f2", color: c.danger }}>{editError}</p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <VButton variant="secondary" onClick={() => setEditTarget(null)}>Cancel</VButton>
                <VButton onClick={handleEdit} disabled={editSaving || barcodeReading}><SquarePen size={14} /> {editSaving ? "Saving..." : "Save Changes"}</VButton>
              </div>
            </div>
          </VCard>
        </div>
      )}
    </StudentShell>
  );
}
