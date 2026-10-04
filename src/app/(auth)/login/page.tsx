"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { VButton, VInput, vcolors as c } from "@/components/ui/vault";
import { toast } from "sonner";
import LockerIllustration from "@/components/locker-illustration";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [phase, setPhase] = useState<"intro" | "transitioning" | "complete">("intro");
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
    const t1 = setTimeout(() => { if (!skipAnim.current) setPhase("transitioning"); }, 4800);
    const t2 = setTimeout(() => { if (!skipAnim.current) setPhase("complete"); }, 5400);

    function skip(e: MouseEvent | KeyboardEvent) {
      if ("key" in e && e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      skipAnim.current = true;
      setPhase("complete");
    }
    document.addEventListener("click", skip);
    document.addEventListener("keydown", skip);

    return () => {
      clearTimeout(t1); clearTimeout(t2);
      document.removeEventListener("click", skip);
      document.removeEventListener("keydown", skip);
    };
  }, [phase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Login failed"); return; }
      localStorage.setItem("token", data.data.token);
      localStorage.setItem("user", JSON.stringify(data.data.user));
      toast.success("Login successful");
      const role = data.data.user.role;
      if (role === "ADMIN") router.push("/dashboard/admin");
      else router.push("/dashboard/student");
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#F7F6F3" }}>
      {/* Full-screen locker animation - becomes blurred background */}
      <div className={`absolute inset-0 transition-transform duration-700 ease-in-out ${
        phase === "intro" ? "scale-100" : "scale-105"
      }`}
        style={{
          filter: phase !== "intro" ? "blur(6px) brightness(0.7)" : "none",
        }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#f7f6f3] to-[#edebe7]" />
        <LockerIllustration hideIdCard={phase !== "intro"} />
      </div>

      {/* Overlay gradient for readability when form appears */}
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

      {/* Centered login form */}
      {showForm && (
      <div className="absolute inset-0 flex items-center justify-center p-6 animate-in fade-in duration-700 ease-in-out"
        style={{}}>
        <div className="w-full max-w-[420px] rounded-[20px] p-8 relative"
          style={{
            background: "white",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.9), 0 0 20px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.04), 0 20px 48px rgba(53,92,138,0.08)",
          }}>
          {/* Logo centered */}
          <div className="flex flex-col items-center mb-6">
            <img src="/logo-removebg-preview.png" alt="VaultQ" className="object-cover mb-4"
              style={{ width: "120px", height: "120px" }} />
            <p className="text-base text-center" style={{ color: "#475569", fontWeight: 400 }}>Sign in to your account to continue</p>
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
              <label htmlFor="email" className="text-sm font-medium block" style={{ color: c.text }}>Email</label>
              <VInput
                id="email" type="email" placeholder="name@example.com" required autoFocus
                style={{ borderColor: "#94a3b8", backgroundColor: c.borderLight, color: c.text, boxShadow: "none" }}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium block" style={{ color: c.text }}>Password</label>
              <div className="relative">
                <VInput
                  id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" required
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

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 rounded text-[#355C8A] accent-[#355C8A]"
                  style={{ borderColor: c.border, borderRadius: "4px" }} />
                <span className="text-sm" style={{ color: "#475569" }}>Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-sm font-medium transition-colors duration-200 hover:opacity-80" style={{ color: c.primary }}>
                Forgot password?
              </Link>
            </div>

            <VButton type="submit" size="lg"
              className="w-full !h-11 !rounded-xl text-[15px] font-semibold"
              disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </VButton>
          </form>

          <div className="mt-5 text-center">
            <p className="text-sm" style={{ color: "#475569" }}>
              Don&apos;t have an account?{" "}
              <Link href="/register?skip=1" className="font-medium transition-colors duration-200 hover:opacity-80" style={{ color: "#355C8A" }}>
                Sign up
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
    </div>
  );
}
