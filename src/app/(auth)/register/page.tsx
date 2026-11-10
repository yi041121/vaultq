"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Barcode, Camera, Upload, X, CheckCircle2, Loader2 } from "lucide-react";
import { VButton, VInput, vcolors as c } from "@/components/ui/vault";
import { showCenteredMessage } from "@/components/centered-message";
import LockerIllustration from "@/components/locker-illustration";
import { markSessionActivity } from "@/lib/idle-session";
import BarcodeScanner from "@/components/barcode-scanner";
import { decodeBarcodeFromImage } from "@/lib/barcode-decode";
import { getPersonNameError, sanitizePersonNameInput, NAME_MAX_LENGTH } from "@/lib/person-name";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [googlePrefill, setGooglePrefill] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeFromImage, setBarcodeFromImage] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const [barcodeExists, setBarcodeExists] = useState(false);
  const [barcodeAvailable, setBarcodeAvailable] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const availableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);
  const [showCamera, setShowCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"intro" | "complete">("intro");
  const showForm = phase !== "intro";
  const skipAnim = useRef(false);

  useEffect(() => {
    // Prefill from Google signup (?name=&email= handed over by the OAuth callback)
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const gName = sp.get("name");
      const gEmail = sp.get("email");
      const gBarcode = sp.get("barcode");
      if (gName || gEmail) {
        setForm((f) => ({ ...f, name: gName || f.name, email: gEmail || f.email }));
        setGooglePrefill(!!gEmail);
      }
      // Barcode detected before the Google round-trip: restore it from the
      // callback URL first, then the localStorage fallback.
      let restore = /^[0-9]{10}$/.test(gBarcode || "") ? gBarcode! : "";
      if (!restore) {
        const saved = localStorage.getItem("vq_register_barcode") || "";
        if (/^[0-9]{10}$/.test(saved)) restore = saved;
      }
      localStorage.removeItem("vq_register_barcode");
      if (restore) {
        setBarcode(restore);
        flashBarcodeSuccess();
        scheduleBarcodeCheck(restore);
      }
    }
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

  // Live existence check: once 10 digits are entered, swap the helper text
  // to "already registered" inline instead of a popup on submit.
  function scheduleBarcodeCheck(code: string) {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const seq = ++checkSeq.current;
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-barcode?code=${code}`);
        const data = await res.json().catch(() => null);
        if (seq !== checkSeq.current) return; // stale response
        if (data && data.data) {
          const exists = !!data.data.exists;
          setBarcodeExists(exists);
          setBarcodeAvailable(!exists);
          // Success message shows once, then disappears
          if (!exists) {
            if (availableTimer.current) clearTimeout(availableTimer.current);
            availableTimer.current = setTimeout(() => {
              if (seq === checkSeq.current) setBarcodeAvailable(false);
            }, 1200);
          }
        }
      } catch {
        // fail-open: leave helper text as-is on network error
      }
    }, 250);
  }

  function updateBarcode(raw: string) {
    const v = raw.replace(/\D/g, "");
    setBarcode(v);
    setBarcodeExists(false);
    setBarcodeAvailable(false);
    if (availableTimer.current) clearTimeout(availableTimer.current);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    // Keep a detected barcode across the Google OAuth round-trip
    if (typeof window !== "undefined") {
      if (/^[0-9]{10}$/.test(v)) localStorage.setItem("vq_register_barcode", v);
      else localStorage.removeItem("vq_register_barcode");
    }
    if (v && !/^[0-9]{10}$/.test(v)) {
      setBarcodeError("Exactly 10 digits required");
    } else {
      setBarcodeError(null);
      if (/^[0-9]{10}$/.test(v)) scheduleBarcodeCheck(v);
    }
  }

  useEffect(() => {
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
      if (availableTimer.current) clearTimeout(availableTimer.current);
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  // Show the "Barcode successfully detected" confirmation briefly, then hide it.
  function flashBarcodeSuccess() {
    setBarcodeFromImage(true);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setBarcodeFromImage(false), 1000);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
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

    setReadingImage(true);
    setBarcodeError(null);
    const code = await decodeBarcodeFromImage(file);
    setReadingImage(false);
    if (code) {
      updateBarcode(code);
      flashBarcodeSuccess();
    } else {
      setBarcodeFromImage(false);
      setBarcodeError("No barcode detected in this image. Please upload a clear photo of the card barcode.");
      showCenteredMessage("error", "No barcode detected in this image");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameError = getPersonNameError(form.name);
    if (nameError) {
      setNameError(nameError);
      return;
    }
    if (!form.password) {
      setPasswordError("Password is required");
      return;
    }
    if (form.password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setEmailError("Invalid email address");
      return;
    }
    if (!form.email.trim().toLowerCase().endsWith("@student.tarc.edu.my")) {
      setEmailError("Must use your @student.tarc.edu.my email");
      return;
    }
    if (barcode && !/^[0-9]{10}$/.test(barcode)) {
      setBarcodeError("Exactly 10 digits required");
      return;
    }
    if (!barcode) {
      setBarcodeError("Card barcode is required");
      showCenteredMessage("error", "Upload a previous card photo, scan your card, or ask an admin to register you");
      return;
    }
    if (barcodeExists) {
      return; // message already shown inline under the field
    }
    // Duplicate email: show the inline error and stop — never open the confirm step
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
      const d = await res.json().catch(() => null);
      if (d?.data?.exists) {
        setEmailError("Email already registered");
        return;
      }
    } catch {}
    setShowConfirm(true);
  }

  async function doRegister() {
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
      if (!res.ok) {
        // Show field problems directly under their field (like barcode)
        setShowConfirm(false);
        if (data.error && /barcode/i.test(data.error)) {
          setBarcodeError(data.error);
          setLoading(false);
          return;
        }
        if (data.error && /full name|letters only/i.test(data.error)) {
          setNameError(data.error);
          setLoading(false);
          return;
        }
        if (data.error && /email/i.test(data.error)) {
          setEmailError(data.error);
          setLoading(false);
          return;
        }
        showCenteredMessage("error", data.error || "Registration failed");
        setLoading(false);
        return;
      }
      localStorage.setItem("token", data.data.token);
      localStorage.setItem("user", JSON.stringify(data.data.user));
      markSessionActivity();
      const role = data.data.user.role;
      const target = role === "ADMIN" ? "/dashboard/admin" : "/dashboard/student";
      // Show centered success popup on this page, then redirect quickly —
      // rendered here so it never appears again on the dashboard.
      // Keep loading=true so the button stays in "Creating..." state.
      setSucceeded(true);
      localStorage.removeItem("vq_register_barcode");
      setTimeout(() => router.push(target), 500);
    } catch { showCenteredMessage("error", "Something went wrong"); setLoading(false); }
  }

  return (
    <div className="min-h-[100dvh] relative overflow-hidden" style={{ backgroundColor: "#F7F6F3" }}>
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
        <p className="text-sm font-medium tracking-wide text-center px-4" style={{ color: "#7FB8B5" }}>
          <span className="sm:hidden">Tap anywhere to continue</span>
          <span className="hidden sm:inline">Click or press <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(53,92,138,0.08)", color: "#355C8A" }}>Space</kbd> / <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(53,92,138,0.08)", color: "#355C8A" }}>Enter</kbd> to skip</span>
        </p>
      </div>

      {/* Centered register form */}
      {showForm && (
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-700 ease-in-out">
        <div className="w-full max-w-[420px] rounded-[20px] p-6 sm:p-8 relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
          style={{
            background: "white",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.9), 0 0 20px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.04), 0 20px 48px rgba(53,92,138,0.08)",
          }}>
          {/* Logo centered */}
          <div className="flex flex-col items-center mb-6">
            <img src="/logo-removebg-preview.png" alt="VaultQ" className="object-contain mb-3 sm:mb-4 w-20 h-20 sm:w-[120px] sm:h-[120px]" />
            <p className="text-base text-center" style={{ color: "#475569", fontWeight: 400 }}>Create your account to get started</p>
          </div>

          {/* Continue with Google */}
          <button type="button"
            className="w-full h-11 rounded-xl text-sm font-medium flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] mb-4"
            style={{ border: "1px solid #cbd5e1", backgroundColor: "white", color: "#0f172a" }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#e2e8f0"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
            onClick={() => {
              const bc = /^[0-9]{10}$/.test(barcode) ? `&bc=${barcode}` : "";
              window.location.href = `/api/auth/google?intent=signup${bc}`;
            }}>
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
              <label htmlFor="name" className="text-sm font-medium block" style={{ color: c.text }}>Name <span style={{ color: c.danger }}>*</span></label>
              <VInput
                id="name" type="text" placeholder="John Doe" required autoFocus maxLength={NAME_MAX_LENGTH}
                style={{ borderColor: nameError ? c.danger : "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: sanitizePersonNameInput(e.target.value) }); setNameError(null); }}
              />
              {nameError && (
                <p className="text-[11px]" style={{ color: c.danger }}>{nameError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium block" style={{ color: c.text }}>
                Student email <span style={{ color: c.danger }}>*</span>
              </label>
              <div className="relative">
                <VInput
                  id="email" type="email" placeholder="name@student.tarc.edu.my" required
                  readOnly={googlePrefill}
                  className={googlePrefill ? "pr-10" : ""}
                  style={{ borderColor: emailError ? c.danger : "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none", opacity: googlePrefill ? 0.75 : 1 }}
                  value={form.email}
                  onChange={(e) => { setForm({ ...form, email: e.target.value }); setEmailError(null); }}
                />
                {googlePrefill && (
                  <button type="button"
                    onClick={() => {
                      setGooglePrefill(false);
                      setForm((f) => ({ ...f, email: "" }));
                      setEmailError(null);
                    }}
                    title="Clear Google email — type your own or choose another Google account"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white transition-colors duration-200 cursor-pointer"
                    style={{ color: c.textMuted }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              {emailError && (
                <p className="text-[11px]" style={{ color: c.danger }}>{emailError}</p>
              )}
            </div>

            {/* Card Barcode — 10-digit + file + camera */}
            <div className="space-y-1.5">
              <label htmlFor="cardBarcode" className="text-sm font-medium block" style={{ color: c.text }}>
                Card Barcode <span style={{ color: c.danger }}>*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textLight }} />
                  <VInput
                    id="cardBarcode" type="text" placeholder="e.g. 2000132602"
                    className={`pl-10 pr-10 ${barcode.length === 10 ? "cursor-default" : ""}`}
                    inputMode="numeric"
                    maxLength={10}
                    readOnly={barcode.length === 10}
                    style={{ borderColor: barcodeError || barcodeExists ? c.danger : barcodeAvailable ? "#16a34a" : "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                    value={barcode}
                    onChange={(e) => updateBarcode(e.target.value)}
                  />
                  {barcode && (
                    <button type="button" onClick={() => { setBarcode(""); setBarcodeError(null); setBarcodeFromImage(false); setBarcodeExists(false); setBarcodeAvailable(false); if (typeof window !== "undefined") localStorage.removeItem("vq_register_barcode"); if (checkTimer.current) clearTimeout(checkTimer.current); if (availableTimer.current) clearTimeout(availableTimer.current); }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white transition-colors duration-200 cursor-pointer" style={{ color: c.textMuted }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <label className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 ${readingImage ? "cursor-wait opacity-70" : "cursor-pointer hover:bg-[#f1f5f9]"}`}
                  style={{ borderColor: readingImage ? c.primary : "#94a3b8", backgroundColor: "white", color: readingImage ? c.primary : c.textMuted }} title="Upload barcode image">
                  {readingImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={readingImage} />
                </label>
                <button type="button" onClick={() => setShowCamera(true)}
                  className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 hover:bg-[#f1f5f9] cursor-pointer"
                  style={{ borderColor: "#94a3b8", backgroundColor: "white", color: c.primary }} title="Scan with camera">
                  <Camera size={16} />
                </button>
              </div>
              {readingImage ? (
                <p className="text-[11px] flex items-center gap-1.5" style={{ color: c.primary }}>
                  <Loader2 size={12} className="animate-spin" /> Reading barcode from image…
                </p>
              ) : (barcodeError || barcodeExists || barcodeFromImage) ? (
                <p className="text-[11px] flex items-center gap-1.5" style={{
                  color: barcodeExists || barcodeError ? c.danger : "#16a34a",
                }}>
                  {barcodeExists
                    ? "This barcode is already registered"
                    : barcodeError
                    ? barcodeError
                    : (
                      <><CheckCircle2 size={12} /> Barcode successfully detected</>
                    )}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium block" style={{ color: c.text }}>Password <span style={{ color: c.danger }}>*</span></label>
              <div className="relative">
                <VInput
                  id="password" type={showPassword ? "text" : "password"} placeholder="At least 8 characters" required minLength={8}
                  className="pr-12"
                  style={{ borderColor: "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setPasswordError(null); }}
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
              <label htmlFor="confirmPassword" className="text-sm font-medium block" style={{ color: c.text }}>Confirm password <span style={{ color: c.danger }}>*</span></label>
              <div className="relative">
                <VInput
                  id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Repeat your password" required
                  className="pr-12"
                  style={{ borderColor: passwordError ? c.danger : "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                  value={form.confirmPassword}
                  onChange={(e) => { setForm({ ...form, confirmPassword: e.target.value }); setPasswordError(null); }}
                />
                <button type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors duration-200 cursor-pointer"
                  style={{ color: c.textMuted }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "#475569"}
                  onMouseLeave={(e) => e.currentTarget.style.color = c.textMuted}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {passwordError && (
                <p className="text-[11px]" style={{ color: c.danger }}>{passwordError}</p>
              )}
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

      <BarcodeScanner
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onDetect={(code) => { updateBarcode(code); flashBarcodeSuccess(); }}
      />
      <div id="vaultq-file-reader-temp" className="hidden" />

      {/* Confirm details before creating account */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => !loading && setShowConfirm(false)} />
          <div className="relative w-full max-w-[380px] rounded-[20px] p-6 bg-white"
            style={{ boxShadow: "0 20px 48px rgba(53,92,138,0.18)" }}>
            <h3 className="text-base font-semibold text-center mb-1" style={{ color: c.text }}>Confirm your details</h3>
            <p className="text-xs text-center mb-4" style={{ color: c.textMuted }}>Please make sure everything is correct.</p>
            <div className="rounded-xl p-4 mb-5 space-y-2.5" style={{ backgroundColor: c.borderLight }}>
              <div>
                <p className="text-[11px] font-medium" style={{ color: c.textMuted }}>Name</p>
                <p className="text-sm font-semibold" style={{ color: c.text }}>{form.name.trim()}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium" style={{ color: c.textMuted }}>Student email</p>
                <p className="text-sm font-semibold break-all" style={{ color: c.text }}>{form.email.trim()}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium" style={{ color: c.textMuted }}>Card barcode</p>
                <p className="text-sm font-semibold" style={{ color: c.text }}>{barcode || "Not provided"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <VButton variant="secondary" className="flex-1" size="lg" onClick={() => setShowConfirm(false)} disabled={loading}>Back</VButton>
              <VButton className="flex-1" size="lg" onClick={doRegister} disabled={loading}>{loading ? "Creating..." : "Confirm"}</VButton>
            </div>
          </div>
        </div>
      )}
      {/* Centered success popup — page-scoped, never shows on the dashboard */}
      {succeeded && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ backgroundColor: "rgba(15,23,42,0.35)" }}>
          <div className="rounded-[20px] px-8 py-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
            style={{ background: "white", boxShadow: "0 20px 48px rgba(53,92,138,0.18)" }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "#f0fdf4" }}>
              <CheckCircle2 size={30} style={{ color: "#16a34a" }} />
            </div>
            <p className="text-base font-semibold" style={{ color: "#0f172a" }}>Account created successfully</p>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>Redirecting...</p>
          </div>
        </div>
      )}
    </div>
  );
}
