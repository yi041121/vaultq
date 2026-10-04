"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Phone, GraduationCap, Save, LogOut, Shield, Barcode, Camera, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import { VCard, VButton, VInput, vcolors as c } from "@/components/ui/vault";
import BarcodeScanner from "@/components/barcode-scanner";

interface UserData { id: string; name: string; email: string; role: string; cardBarcode?: string | null; }

export default function StudentProfile() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("012-3456789");
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      const fallback = { id: "1", name: "Student User", email: "student@example.com", role: "STUDENT", cardBarcode: null };
      setUser(fallback);
      setName(fallback.name);
      setBarcode(fallback.cardBarcode || "");
      return;
    }
    const parsed = JSON.parse(stored);
    setUser(parsed);
    setName(parsed.name);
    setBarcode(parsed.cardBarcode || "");
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out");
    router.push("/login?skip=1");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image of the barcode");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    const extract = (raw: string) => {
      const digits = raw.replace(/\D/g, "");
      const m = digits.match(/[0-9]{10}/);
      return m ? m[0] : null;
    };
    const img = new Image();
    img.onload = async () => {
      try {
        // @ts-ignore
        if ("BarcodeDetector" in window) {
          // @ts-ignore
          const detector = new window.BarcodeDetector({ formats: ["code_128", "ean_13", "code_39"] });
          const barcodes = await detector.detect(img);
          for (const b of barcodes) {
            const code = extract(b.rawValue || "");
            if (code) {
              setBarcode(code);
              setBarcodeError(null);
              toast.success(`Scanned: ${code}`);
              if (fileRef.current) fileRef.current.value = "";
              URL.revokeObjectURL(img.src);
              return;
            }
          }
        }
        URL.revokeObjectURL(img.src);
      } catch {}
      // Fallback html5-qrcode
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const tempId = "vaultq-profile-file-reader-temp";
        let tempEl = document.getElementById(tempId);
        if (!tempEl) {
          tempEl = document.createElement("div");
          tempEl.id = tempId;
          tempEl.style.display = "none";
          document.body.appendChild(tempEl);
        }
        const html5QrCode = new Html5Qrcode(tempId);
        const decoded = await html5QrCode.scanFile(file, true);
        const code = extract(decoded);
        if (code) {
          setBarcode(code);
          setBarcodeError(null);
          toast.success(`Scanned: ${code}`);
          if (fileRef.current) fileRef.current.value = "";
          try { html5QrCode.clear(); } catch {}
          return;
        }
        toast.error("Could not detect 10-digit barcode — please type manually");
      } catch {
        toast.error("Could not detect 10-digit barcode — please type manually");
      }
      if (fileRef.current) fileRef.current.value = "";
    };
    img.onerror = () => {
      toast.error("Could not read image");
      if (fileRef.current) fileRef.current.value = "";
    };
    img.src = URL.createObjectURL(file);
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    if (barcode && !/^[0-9]{10}$/.test(barcode)) {
      setBarcodeError("Exactly 10 digits required");
      toast.error("Card barcode must be exactly 10 digits");
      return;
    }
    setSaving(true);
    setTimeout(async () => {
      if (user) {
        const updated = { ...user, name: name.trim(), cardBarcode: barcode || null };
        localStorage.setItem("user", JSON.stringify(updated));
        setUser(updated);
        // Try API
        try {
          const token = localStorage.getItem("token");
          if (token) {
            await fetch("/api/user/barcode", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ cardBarcode: barcode || null }),
            });
          }
        } catch {}
      }
      setSaving(false);
      toast.success("Profile updated");
    }, 600);
  }

  if (!user || !mounted) return null;

  const needsBarcode = !user.cardBarcode;

  return (
    <StudentShell active="Profile" userName={user.name} userRole={user.role} pageTitle="Profile" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full h-full flex flex-col items-center">
          <div className="w-full max-w-3xl mx-auto space-y-5">
            {/* Header card */}
            <VCard className="p-6 lg:p-8 flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shrink-0"
                style={{ backgroundColor: c.primary }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold truncate" style={{ color: c.text }}>{user.name}</h2>
                <p className="text-sm" style={{ color: c.textMuted }}>{user.email}</p>
                <span className="inline-flex mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: c.primarySoft, color: c.primary }}>
                  {user.role}
                </span>
              </div>
              <button type="button"
                className="hidden sm:flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border bg-white transition-colors duration-200 cursor-pointer shrink-0"
                style={{ borderColor: c.border, color: c.textMuted }}
                onClick={handleLogout}>
                <LogOut size={14} /> Sign out
              </button>
            </VCard>

            {needsBarcode && (
              <div className="rounded-xl border px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                <Barcode size={18} className="shrink-0" />
                <p className="text-xs font-medium flex-1">Register your 10-digit barcode to enable locker pickup.</p>
              </div>
            )}

            {/* Card Barcode */}
            <VCard className="p-6 lg:p-8">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.primary}15` }}>
                  <Barcode size={16} style={{ color: c.primary }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: c.text }}>Card Barcode</h3>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium block" style={{ color: c.text }}>
                  Barcode <span style={{ color: c.danger }}>*</span> <span className="text-xs font-normal" style={{ color: c.textMuted }}></span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                    <VInput
                      type="text" inputMode="numeric" placeholder="2000132602" maxLength={10}
                      className="pl-10 pr-10"
                      style={{ borderColor: barcodeError ? c.danger : c.border, backgroundColor: "#fff", color: c.text }}
                      value={barcode}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setBarcode(v);
                        if (v && !/^[0-9]{10}$/.test(v)) setBarcodeError("Exactly 10 digits required");
                        else setBarcodeError(null);
                      }}
                    />
                    {barcode && (
                      <button type="button" onClick={() => { setBarcode(""); setBarcodeError(null); }}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <label className="w-11 h-11 rounded-xl border flex items-center justify-center cursor-pointer shrink-0 transition-colors duration-200 hover:bg-[#f1f5f9]"
                    style={{ borderColor: c.border, backgroundColor: "#fff", color: c.textMuted }} title="Upload barcode image">
                    <Upload size={16} />
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                  </label>
                  <button type="button" onClick={() => setShowCamera(true)}
                    className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 hover:bg-[#f1f5f9] cursor-pointer"
                    style={{ borderColor: c.border, backgroundColor: "#fff", color: c.primary }} title="Scan with camera">
                    <Camera size={16} />
                  </button>
                </div>
                <p className="text-[11px]" style={{ color: barcodeError ? c.danger : c.textLight }}>
                  {barcodeError || "scan card or type 10-digit numbers below barcode"}
                </p>
                {barcode && !barcodeError && (
                  <p className="text-xs p-2.5 rounded-lg" style={{ backgroundColor: c.fill, color: c.textMuted }}>
                    Preview: <span style={{ color: c.text, fontWeight: 600, letterSpacing: "0.05em" }}>{barcode}</span> {needsBarcode ? "— will be saved on Save Changes" : "— saved"}
                  </p>
                )}
              </div>
            </VCard>

            {/* Personal info */}
            <VCard className="p-6 lg:p-8">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.primary}15` }}>
                  <User size={16} style={{ color: c.primary }} />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: c.text }}>Personal Information</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Full name</label>
                  <VInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
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
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Phone</label>
                    <div className="relative">
                      <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: c.textLight }} />
                      <VInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="012-3456789" className="pl-10" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Student ID</label>
                    <div className="relative">
                      <GraduationCap size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: c.textLight }} />
                      <VInput value={user.id} disabled className="pl-10 opacity-60" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>Role</label>
                    <div className="relative">
                      <Shield size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: c.textLight }} />
                      <VInput value={user.role} disabled className="pl-10 opacity-60" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t" style={{ borderColor: c.borderLight }}>
                <VButton variant="secondary" size="lg" onClick={() => { setName(user.name); setBarcode(user.cardBarcode || ""); setBarcodeError(null); }}>Cancel</VButton>
                <VButton size="lg" onClick={handleSave} disabled={saving || !name.trim() || !!barcodeError}>
                  <Save size={15} /> {saving ? "Saving..." : "Save Changes"}
                </VButton>
              </div>
            </VCard>
          </div>
        </div>
      </main>
      <BarcodeScanner open={showCamera} onClose={() => setShowCamera(false)} onDetect={(code) => { setBarcode(code); setBarcodeError(null); toast.success(`Scanned: ${code}`); }} />
      <div id="vaultq-profile-file-reader-temp" className="hidden" />
    </StudentShell>
  );
}
