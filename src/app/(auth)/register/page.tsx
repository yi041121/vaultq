"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Barcode, Camera, Upload, X } from "lucide-react";
import { VButton, VInput, vcolors as c } from "@/components/ui/vault";
import { toast } from "sonner";
import LockerIllustration from "@/components/locker-illustration";
import BarcodeScanner from "@/components/barcode-scanner";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"intro" | "complete">("intro");
  const showForm = phase !== "intro";
  const skipAnim = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("skip=1")) {
      skipAnim.current = true;
      setPhase("complete");
    }
  }, []);

  useEffect(() => {
    if (phase !== "intro") return;
    const t = setTimeout(() => { if (!skipAnim.current) setPhase("complete"); }, 5400);

    function skip(e: MouseEvent | KeyboardEvent) {
      if ("key" in e && e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      skipAnim.current = true;
      setPhase("complete");
    }
    document.addEventListener("click", skip);
    document.addEventListener("keydown", skip);

    return () => {
      clearTimeout(t);
      document.removeEventListener("click", skip);
      document.removeEventListener("keydown", skip);
    };
  }, [phase]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
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

    // Try native BarcodeDetector on image
    try {
      // @ts-ignore
      if ("BarcodeDetector" in window) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });
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
        URL.revokeObjectURL(img.src);
      }
    } catch {}

    // Fallback: html5-qrcode scanFile
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const html5QrCode = new Html5Qrcode("vaultq-file-reader-temp");
      // Need a temporary element in DOM
      let tempEl = document.getElementById("vaultq-file-reader-temp");
      if (!tempEl) {
        tempEl = document.createElement("div");
        tempEl.id = "vaultq-file-reader-temp";
        tempEl.style.display = "none";
        document.body.appendChild(tempEl);
      }
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (barcode && !/^[0-9]{10}$/.test(barcode)) {
      setBarcodeError("Exactly 10 digits required");
      toast.error("Card barcode must be exactly 10 digits");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          cardBarcode: barcode || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Registration failed"); return; }
      localStorage.setItem("token", data.data.token);
      localStorage.setItem("user", JSON.stringify(data.data.user));
      toast.success("Account created successfully");
      const role = data.data.user.role;
      if (role === "ADMIN") router.push("/dashboard/admin");
      else router.push("/dashboard/student");
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#F7F6F3" }}>
      {/* Full-screen locker animation - becomes blurred background */}
      <div className="absolute inset-0 transition-transform duration-700 ease-in-out"
        style={{
          filter: phase !== "intro" ? "blur(6px) brightness(0.7)" : "none",
          transform: phase !== "intro" ? "scale(1.05)" : "scale(1)",
        }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#f7f6f3] to-[#edebe7]" />
        <LockerIllustration hideIdCard={phase !== "intro"} />
      </div>

      {/* Overlay gradient */}
      <div className="absolute inset-0 transition-opacity duration-500 ease-in-out pointer-events-none"
        style={{
          opacity: phase !== "intro" ? 0.45 : 0,
          background: "linear-gradient(135deg, rgba(247,246,243,0.3), rgba(237,235,231,0.6))",
        }} />

      {/* Skip hint */}
      <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 transition-all duration-500 z-10 ${
        phase === "intro" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}>
        <p className="text-sm font-medium tracking-wide" style={{ color: "#7FB8B5" }}>
          Click or press <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(53,92,138,0.08)", color: "#355C8A" }}>Space</kbd> / <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(53,92,138,0.08)", color: "#355C8A" }}>Enter</kbd> to skip
        </p>
      </div>

      {/* Centered register form */}
      {showForm && (
      <div className="absolute inset-0 flex items-center justify-center p-6 animate-in fade-in duration-700 ease-in-out">
        <div className="w-full max-w-[420px] rounded-[20px] p-8 relative max-h-[90vh] overflow-auto"
          style={{
            background: "white",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.9), 0 0 20px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.04), 0 20px 48px rgba(53,92,138,0.08)",
          }}>
          {/* Logo centered */}
          <div className="flex flex-col items-center mb-6">
            <img src="/logo-removebg-preview.png" alt="VaultQ" className="object-cover mb-4"
              style={{ width: "120px", height: "120px" }} />
            <p className="text-base text-center" style={{ color: "#475569", fontWeight: 400 }}>Create your account to get started</p>
          </div>

          {/* Continue with Google */}
          <button type="button"
            className="w-full h-11 rounded-xl text-sm font-medium flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] mb-4"
            style={{ border: "1px solid #cbd5e1", backgroundColor: "white", color: "#0f172a" }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#e2e8f0"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ backgroundColor: "#cbd5e1" }} />
            <span className="text-xs font-medium" style={{ color: "#64748b" }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: "#cbd5e1" }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium block" style={{ color: c.text }}>Full name</label>
              <VInput
                id="name" type="text" placeholder="John Doe" required autoFocus
                style={{ borderColor: "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium block" style={{ color: c.text }}>Email</label>
              <VInput
                id="email" type="email" placeholder="name@example.com" required
                style={{ borderColor: "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            {/* Card Barcode — 10-digit + file + camera */}
            <div className="space-y-1.5">
              <label htmlFor="cardBarcode" className="text-sm font-medium block" style={{ color: c.text }}>
                Card Barcode <span className="text-xs font-normal" style={{ color: c.textMuted }}></span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                  <VInput
                    id="cardBarcode" type="text" inputMode="numeric" placeholder="2000132600" maxLength={10}
                    className="pl-10 pr-10"
                    style={{ borderColor: barcodeError ? c.danger : "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
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
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <label className="w-11 h-11 rounded-xl border flex items-center justify-center cursor-pointer shrink-0 transition-colors duration-200 hover:bg-[#f1f5f9]"
                  style={{ borderColor: "#94a3b8", backgroundColor: "white", color: c.textMuted }} title="Upload barcode image">
                  <Upload size={16} />
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </label>
                <button type="button" onClick={() => setShowCamera(true)}
                  className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 hover:bg-[#f1f5f9] cursor-pointer"
                  style={{ borderColor: "#94a3b8", backgroundColor: "white", color: c.primary }} title="Scan with camera">
                  <Camera size={16} />
                </button>
              </div>
              <p className="text-[11px]" style={{ color: barcodeError ? c.danger : c.textLight }}>
                {barcodeError || "10 digits below barcode"}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium block" style={{ color: c.text }}>Password</label>
              <div className="relative">
                <VInput
                  id="password" type={showPassword ? "text" : "password"} placeholder="At least 8 characters" required
                  className="pr-12"
                  style={{ borderColor: "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors duration-200 cursor-pointer"
                  style={{ color: c.textMuted }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "#475569"}
                  onMouseLeave={(e) => e.currentTarget.style.color = c.textMuted}
                  onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium block" style={{ color: c.text }}>Confirm password</label>
              <VInput
                id="confirmPassword" type={showPassword ? "text" : "password"} placeholder="Repeat your password" required
                style={{ borderColor: "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
            </div>

            <VButton type="submit" size="lg"
              className="w-full !h-11 !rounded-xl text-[15px] font-semibold"
              disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </VButton>
          </form>

          <div className="mt-5 text-center">
            <p className="text-sm" style={{ color: "#475569" }}>
              Already have an account?{" "}
              <Link href="/login?skip=1" className="font-medium transition-colors duration-200 hover:opacity-80" style={{ color: "#355C8A" }}>
                Sign in
              </Link>
            </p>
          </div>

          <div className="mt-6 pt-5 border-t" style={{ borderColor: "#cbd5e1" }}>
            <div className="flex items-center justify-center gap-5 text-xs font-medium tracking-wide" style={{ color: "#64748b" }}>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Secure
              </span>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                2FA Ready
              </span>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3H8"/><path d="M12 6v12"/></svg>
                IoT Enabled
              </span>
            </div>
          </div>
        </div>
      </div>
      )}

      <BarcodeScanner open={showCamera} onClose={() => setShowCamera(false)} onDetect={(code) => { setBarcode(code); setBarcodeError(null); toast.success(`Scanned: ${code}`); }} />
      <div id="vaultq-file-reader-temp" className="hidden" />
    </div>
  );
}
