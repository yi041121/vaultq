"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Save, LogOut, Barcode, Camera, Upload, GraduationCap, Loader2, CheckCircle2, Pencil, QrCode, Check } from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StudentBarcodeModal } from "@/components/student-barcode-modal";
import { decodeBarcodeFromImage } from "@/lib/barcode-decode";
import { getPersonNameError, normalizePersonName, sanitizePersonNameInput, NAME_MAX_LENGTH } from "@/lib/person-name";
import { isValidStudentId, normalizeStudentId, STUDENT_ID_ERROR_MESSAGE, STUDENT_ID_MAX_LENGTH } from "@/lib/student-id";
import { StudentShell } from "@/components/student-shell";
import { VCard, VButton, VInput, vcolors as c } from "@/components/ui/vault";
import BarcodeScanner from "@/components/barcode-scanner";

interface UserData { id: string; name: string; email: string; role: string; studentId?: string | null; cardBarcode?: string | null; }

function cleanStudentId(value?: string | null) {
  const sid = (value || "").trim();
  return sid && !/^(null|undefined)$/i.test(sid) ? sid : "";
}

export default function StudentProfile() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [studentIdError, setStudentIdError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [readingImage, setReadingImage] = useState(false);
  const [barcodeFromImage, setBarcodeFromImage] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [barcodeEditing, setBarcodeEditing] = useState(false);
  const [showBarcodeCard, setShowBarcodeCard] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      const fallback = { id: "1", name: "Student User", email: "student@example.com", role: "STUDENT", studentId: null, cardBarcode: null };
      setUser(fallback);
      setName(fallback.name);
      setStudentId(cleanStudentId(fallback.studentId));
      setBarcode(fallback.cardBarcode || "");
      return;
    }
    const parsed = JSON.parse(stored);
    setUser(parsed);
    setName(parsed.name);
    setStudentId(cleanStudentId(parsed.studentId));
    setBarcode(parsed.cardBarcode || "");
  }, []);

  const [confirmLogout, setConfirmLogout] = useState(false);

  // localStorage can be stale (e.g. the barcode was changed directly in the DB),
  // so refresh the profile from the server once on mount.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.data || cancelled) return;
        const fresh: UserData = data.data;
        setUser(fresh);
        setName(fresh.name);
        setStudentId(cleanStudentId(fresh.studentId));
        setBarcode(fresh.cardBarcode || "");
        setBarcodeError(null);
        setBarcodeFromImage(false);
        localStorage.setItem("user", JSON.stringify(fresh));
      } catch {
        // API unreachable — keep the cached values
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?skip=1&loggedOut=1");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showCenteredMessage("error", "Please upload an image of the barcode");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showCenteredMessage("error", "Image must be under 5MB");
      return;
    }
    decodeBarcodeFromImage(file).then((code) => {
      setReadingImage(false);
      if (code) {
        setBarcode(code);
        setBarcodeError(null);
        setBarcodeFromImage(true);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        setBarcodeFromImage(false);
        setBarcodeError("No barcode detected in this image. Please upload a clear photo of the card barcode.");
        showCenteredMessage("error", "No barcode detected in this image");
        if (fileRef.current) fileRef.current.value = "";
      }
    });
    setReadingImage(true);
    setBarcodeError(null);
  }

  async function handleSave() {
    const nameError = getPersonNameError(name);
    if (nameError) {
      setNameError(nameError);
      return;
    }
    setNameError(null);
    if (!barcode) {
      setBarcodeError("Card barcode is required");
      showCenteredMessage("error", "Enter, scan, or upload your card barcode");
      return;
    }
    if (!/^[0-9]{10}$/.test(barcode)) {
      setBarcodeError("Exactly 10 digits required");
      showCenteredMessage("error", "Card barcode must be exactly 10 digits");
      return;
    }
    const sid = normalizeStudentId(studentId);
    if (sid && !isValidStudentId(sid)) {
      setStudentIdError(STUDENT_ID_ERROR_MESSAGE);
      return;
    }
    setStudentIdError(null);
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Session expired — please sign in again");
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim().replace(/\s+/g, " "),
          studentId: sid || null,
          ...(barcode ? { cardBarcode: barcode } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        const msg = data?.error || "Failed to update profile";
        if (/student id/i.test(msg)) {
          setStudentIdError(msg);
        } else if (/name/i.test(msg)) {
          setNameError(msg);
        } else if (/barcode/i.test(msg)) {
          setBarcodeError(msg);
        } else {
          showCenteredMessage("error", msg);
        }
        return;
      }
      const updated: UserData = data.data;
      setUser(updated);
      setName(updated.name);
      setStudentId(cleanStudentId(updated.studentId));
      setBarcode(updated.cardBarcode || "");
      localStorage.setItem("user", JSON.stringify(updated));
      // Saved — replace the success message with the "change your barcode" hint.
      setBarcodeFromImage(false);
      setBarcodeEditing(false);
      showCenteredMessage("success", "Profile updated");
    } catch (e) {
      showCenteredMessage("error", e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (!user || !mounted) return null;

  const needsBarcode = !user.cardBarcode;
  const savedBarcode = user.cardBarcode || "";
  const savedStudentId = cleanStudentId(user.studentId);
  const isDirty =
    normalizePersonName(name) !== normalizePersonName(user.name) ||
    normalizeStudentId(studentId) !== normalizeStudentId(cleanStudentId(user.studentId)) ||
    barcode !== (user.cardBarcode || "");

  return (
    <StudentShell active="Profile" userName={user.name} userRole={user.role} pageTitle="Profile" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-28 lg:pb-6">
        <div className="px-4 sm:px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col items-center">
          <div className="w-full max-w-3xl mx-auto space-y-5">
            {/* Header card */}
            <VCard className="p-5 sm:p-6 lg:p-8 flex items-center gap-4 sm:gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold text-white shrink-0"
                style={{ backgroundColor: c.primary }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold truncate" style={{ color: c.text }}>{user.name}</h2>
                <p className="text-sm truncate" style={{ color: c.textMuted }}>{user.email}</p>
                <span className="inline-flex mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: c.primarySoft, color: c.primary }}>
                  {user.role}
                </span>
              </div>
              <button type="button"
                className="hidden sm:flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border bg-white transition-colors duration-200 cursor-pointer shrink-0"
                style={{ borderColor: c.border, color: c.textMuted }}
                onClick={() => setConfirmLogout(true)}>
                <LogOut size={14} /> Sign out
              </button>
            </VCard>

            {needsBarcode && (
              <div className="rounded-xl border px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                <Barcode size={18} className="shrink-0" />
                <p className="text-xs font-medium flex-1">No card barcode yet. Enter or scan it, upload a previous card photo, or ask an admin to assign one.</p>
              </div>
            )}

            {/* Card Barcode */}
            <VCard className="p-5 sm:p-6 lg:p-8">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.primary}15` }}>
                    <Barcode size={16} style={{ color: c.primary }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: c.text }}>Card Barcode</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: c.textLight }}>Tap the field to show a scannable code.</p>
                  </div>
                </div>
                <button type="button"
                  onClick={() => setShowBarcodeCard(true)}
                  disabled={!savedBarcode && !savedStudentId}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border bg-white text-[11px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  style={{ borderColor: c.border, color: c.primary }}>
                  <QrCode size={13} /> Show
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium block" style={{ color: c.text }}>Barcode <span style={{ color: c.danger }}>*</span></label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                    <VInput
                      id="profile-card-barcode"
                      type="text"
                      placeholder={barcodeEditing ? "Enter 10-digit barcode" : "Tap to enter or show barcode"}
                      maxLength={10}
                      inputMode="numeric"
                      className={`pl-9 ${barcodeEditing ? "" : "cursor-pointer"}`}
                      readOnly={!barcodeEditing}
                      aria-readonly={!barcodeEditing}
                      onClick={() => {
                        if (barcodeEditing) return;
                        if (savedBarcode || savedStudentId) setShowBarcodeCard(true);
                        else setBarcodeEditing(true);
                      }}
                      onChange={(e) => {
                        setBarcode(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setBarcodeError(null);
                        setBarcodeFromImage(false);
                      }}
                      style={{ borderColor: barcodeError ? c.danger : barcodeFromImage ? "#16a34a" : c.border, backgroundColor: barcodeFromImage ? "#f0fdf4" : c.fill, color: c.text }}
                      value={barcode}
                    />
                  </div>
                  <button type="button"
                    onClick={() => { setBarcodeEditing((editing) => !editing); setBarcodeError(null); }}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 hover:bg-[#f1f5f9] cursor-pointer"
                    style={{ borderColor: barcodeEditing ? c.primary : c.border, backgroundColor: "#fff", color: barcodeEditing ? c.primary : c.textMuted }}
                    title={barcodeEditing ? "Done editing barcode" : "Enter barcode manually"}>
                    {barcodeEditing ? <Check size={16} /> : <Pencil size={16} />}
                  </button>
                  <label className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 ${readingImage ? "cursor-wait opacity-70" : "cursor-pointer hover:bg-[#f1f5f9]"}`}
                    style={{ borderColor: readingImage ? c.primary : c.border, backgroundColor: "#fff", color: readingImage ? c.primary : c.textMuted }} title="Upload barcode image">
                    {readingImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={readingImage} />
                  </label>
                  <button type="button" onClick={() => setShowCamera(true)}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 hover:bg-[#f1f5f9] cursor-pointer"
                    style={{ borderColor: c.border, backgroundColor: "#fff", color: c.primary }} title="Scan with camera">
                    <Camera size={16} />
                  </button>
                </div>
                <p className="text-[11px] flex items-center gap-1.5" style={{ color: readingImage ? c.primary : barcodeError ? c.danger : barcodeFromImage ? "#16a34a" : c.textLight }}>
                  {readingImage ? (
                    <><Loader2 size={12} className="animate-spin" /> Reading barcode from image…</>
                  ) : barcodeFromImage ? (
                    <><CheckCircle2 size={12} /> Barcode successfully detected</>
                  ) : barcodeError ? (
                    barcodeError
                  ) : barcodeEditing ? (
                    "Type the 10 digits printed on your student card."
                  ) : barcode !== savedBarcode ? (
                    "Save changes to update the barcode used by the locker."
                  ) : barcode ? (
                    "Tap the field to show a scannable code, or use the pencil to type a new barcode."
                  ) : (
                    "Scan or upload your card, or tap the pencil to type the barcode manually."
                  )}
                </p>
              </div>
            </VCard>

            {/* Personal info */}
            <VCard className="p-5 sm:p-6 lg:p-8">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.primary}15` }}>
                  <User size={16} style={{ color: c.primary }} />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: c.text }}>Personal Information</h3>
              </div>

              <div className="space-y-4">
                <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Name</label>
                    <VInput
                      value={name}
                      onChange={(e) => { setName(sanitizePersonNameInput(e.target.value)); setNameError(null); }}
                      placeholder="Your name"
                      maxLength={NAME_MAX_LENGTH}
                      style={nameError ? { borderColor: c.danger } : undefined}
                    />
                    {nameError && <p className="text-[11px] mt-1" style={{ color: c.danger }}>{nameError}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Email</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: c.textLight }} />
                      <VInput value={user.email} disabled className="pl-10 opacity-60" />
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: c.textLight }}>Email cannot be changed</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                      Student ID <span className="text-xs font-normal" style={{ color: c.textMuted }}>(optional)</span>
                    </label>
                    <div className="relative">
                      <GraduationCap size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: c.textLight }} />
                      <VInput
                        value={studentId}
                        onChange={(e) => {
                          setStudentId(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, STUDENT_ID_MAX_LENGTH));
                          setStudentIdError(null);
                        }}
                        placeholder="25SMR10180"
                        maxLength={STUDENT_ID_MAX_LENGTH}
                        className="pl-10"
                        style={studentIdError ? { borderColor: c.danger } : undefined}
                      />
                    </div>
                    {studentIdError && (
                      <p className="text-[11px] mt-1" style={{ color: c.danger }}>{studentIdError}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t" style={{ borderColor: c.borderLight }}>
                <VButton variant="secondary" size="lg" onClick={() => { setName(user.name); setStudentId(cleanStudentId(user.studentId)); setStudentIdError(null); setNameError(null); setBarcode(user.cardBarcode || ""); setBarcodeError(null); setBarcodeFromImage(false); setBarcodeEditing(false); }}>Cancel</VButton>
                <VButton size="lg" onClick={handleSave} disabled={saving || readingImage || !isDirty || !name.trim() || barcode.length !== 10 || !!barcodeError || !!studentIdError || !!nameError}>
                  <Save size={15} /> {saving ? "Saving..." : "Save Changes"}
                </VButton>
              </div>
            </VCard>
          </div>
        </div>
      </main>
      <BarcodeScanner
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onDetect={(code) => { setBarcode(code); setBarcodeError(null); setBarcodeFromImage(true); }}
      />
      {showBarcodeCard && (
        <StudentBarcodeModal
          barcode={savedBarcode}
          studentId={savedStudentId}
          name={user.name}
          onClose={() => setShowBarcodeCard(false)}
        />
      )}
      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        subtitle="You will need to sign in again to access your account."
        confirmLabel="Log out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); handleLogout(); }}
      />
    </StudentShell>
  );
}
