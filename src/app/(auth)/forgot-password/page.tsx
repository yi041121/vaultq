"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { VButton, VInput, vcolors as c } from "@/components/ui/vault";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-VaultQ-Request": "1" },
        body: JSON.stringify({ email: value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || "Could not send the reset email. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not send the reset email. Please try again.");
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
          <h1 className="text-lg font-semibold" style={{ color: c.text }}>Forgot your password?</h1>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: c.textMuted }}>
            Enter the email linked to your VaultQ account. We&apos;ll send a secure reset link.
          </p>
        </div>

        {sent ? (
          <div className="text-center" role="status">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: c.primarySoft }}>
              <CheckCircle2 size={24} style={{ color: c.primary }} />
            </div>
            <p className="text-sm font-medium" style={{ color: c.text }}>Check your email</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: c.textMuted }}>
              If an account exists for {email.trim().toLowerCase()}, a reset link has been sent. It expires in 30 minutes and can only be used once.
            </p>
            <p className="mt-2 text-xs" style={{ color: c.textLight }}>Check spam if it does not arrive within a few minutes.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-semibold" style={{ color: c.text }}>Email address</label>
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: c.textMuted }} />
              <VInput id="forgot-email" type="email" inputMode="email" autoComplete="email" autoFocus
                value={email} onChange={(event) => setEmail(event.target.value)}
                placeholder="name@student.tarc.edu.my" className="pl-9" maxLength={254}
                aria-invalid={!!error} aria-describedby={error ? "forgot-error" : undefined} />
            </div>
            {error && <p id="forgot-error" role="alert" className="mt-2 text-xs" style={{ color: c.danger }}>{error}</p>}
            <VButton type="submit" className="mt-5 w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
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
