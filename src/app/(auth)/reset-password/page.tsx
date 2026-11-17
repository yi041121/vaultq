"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { VButton, VInput, vcolors as c } from "@/components/ui/vault";

type PageState = "checking" | "form" | "invalid" | "done";

export default function ResetPasswordPage() {
  const [state, setState] = useState<PageState>("checking");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") || "";
    // The token lives only in the URL, so it is read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value);
    if (!value) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    void fetch(`/api/auth/reset-password?token=${encodeURIComponent(value)}`, {
      headers: { "X-VaultQ-Request": "1" }, cache: "no-store",
    })
      .then((response) => response.json().catch(() => null))
      .then((data) => {
        if (!cancelled) setState(data?.success && data?.data?.valid ? "form" : "invalid");
      })
      .catch(() => { if (!cancelled) setState("invalid"); });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-VaultQ-Request": "1" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || "Could not reset your password. Please try again.");
        return;
      }
      window.history.replaceState(null, "", "/reset-password");
      setState("done");
    } catch {
      setError("Could not reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6" style={{ backgroundColor: c.bg }}>
      <div className="w-full max-w-[420px] rounded-[20px] p-6 sm:p-8"
        style={{ background: c.card, boxShadow: `0 0 0 1px ${c.borderLight}, 0 4px 12px rgba(0,0,0,0.06), 0 20px 48px rgba(0,0,0,0.18)` }}>
        <div className="flex flex-col items-center mb-6 text-center">
          <img src="/logo-removebg-preview.png" alt="VaultQ" className="object-contain mb-3 w-20 h-20 sm:w-[104px] sm:h-[104px]" />
          <h1 className="text-lg font-semibold" style={{ color: c.text }}>Choose a new password</h1>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: c.textMuted }}>
            Use at least 8 characters. Existing sessions will be signed out.
          </p>
        </div>

        {state === "checking" && (
          <p role="status" className="py-8 text-center text-sm" style={{ color: c.textMuted }}>Checking your reset link…</p>
        )}

        {state === "invalid" && (
          <div className="text-center" role="alert">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#fef2f2" }}>
              <ShieldAlert size={24} style={{ color: c.danger }} />
            </div>
            <p className="text-sm font-medium" style={{ color: c.text }}>This reset link is invalid or expired</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: c.textMuted }}>
              Reset links expire after 30 minutes and can only be used once.
            </p>
            <Link href="/forgot-password" className="mt-4 inline-flex text-sm font-semibold hover:opacity-80" style={{ color: c.primary }}>
              Request a new link
            </Link>
          </div>
        )}

        {state === "done" && (
          <div className="text-center" role="status">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: c.primarySoft }}>
              <CheckCircle2 size={24} style={{ color: c.primary }} />
            </div>
            <p className="text-sm font-medium" style={{ color: c.text }}>Password updated</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: c.textMuted }}>
              Sign in again with your new password.
            </p>
            <Link href="/login?skip=1"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-white"
              style={{ backgroundColor: c.primary }}>
              Go to sign in
            </Link>
          </div>
        )}

        {state === "form" && (
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="reset-password" className="mb-1.5 block text-xs font-semibold" style={{ color: c.text }}>New password</label>
            <div className="relative">
              <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: c.textMuted }} />
              <VInput id="reset-password" type={showPassword ? "text" : "password"} autoComplete="new-password" autoFocus
                value={password} onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters" className="pl-9 pr-10" maxLength={1024} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md cursor-pointer"
                style={{ color: c.textMuted }}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <label htmlFor="reset-confirm" className="mt-4 mb-1.5 block text-xs font-semibold" style={{ color: c.text }}>Confirm password</label>
            <VInput id="reset-confirm" type={showPassword ? "text" : "password"} autoComplete="new-password"
              value={confirm} onChange={(event) => setConfirm(event.target.value)}
              placeholder="Re-enter the new password" maxLength={1024} />

            {error && <p id="reset-error" role="alert" className="mt-2 text-xs" style={{ color: c.danger }}>{error}</p>}
            <VButton type="submit" className="mt-5 w-full" disabled={submitting}>
              {submitting ? "Updating…" : "Update password"}
            </VButton>
          </form>
        )}

        <div className="mt-6 border-t pt-4 text-center" style={{ borderColor: c.borderLight }}>
          <Link href="/login?skip=1" className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: c.primary }}>
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
