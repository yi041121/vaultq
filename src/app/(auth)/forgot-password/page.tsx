"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, Mail } from "lucide-react";
import { VButton, VInput, vcolors as c } from "@/components/ui/vault";

type Field = "email" | "barcode";
type FormError = { field: Field | null; message: string };

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<Field, string>>({ email: "", barcode: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  function update(field: Field, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const email = form.email.trim().toLowerCase();
    const barcode = form.barcode.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError({ field: "email", message: "Enter the email address linked to your account." });
      return;
    }
    if (!/^[0-9]{10}$/.test(barcode)) {
      setError({ field: "barcode", message: "Enter the 10-digit barcode printed on your student card." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/self-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-VaultQ-Request": "1" },
        body: JSON.stringify({ email, barcode }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError({ field: null, message: data?.error || "Could not verify your account. Please try again." });
        return;
      }
      // The verification response stores a one-time token in an HttpOnly
      // cookie; the reset page uses it without exposing it in the URL.
      router.push("/reset-password");
    } catch {
      setError({ field: null, message: "Could not verify your account. Check your connection and try again." });
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
          <h1 className="text-lg font-semibold" style={{ color: c.text }}>Reset your password</h1>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: c.textMuted }}>
            Enter the email and student card barcode linked to your VaultQ account.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="reset-email" className="mb-1.5 block text-xs font-semibold" style={{ color: c.text }}>Email address</label>
          <div className="relative">
            <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: c.textMuted }} />
            <VInput id="reset-email" type="email" inputMode="email" autoComplete="email" autoFocus
              value={form.email} onChange={(event) => update("email", event.target.value)}
              placeholder="name@student.tarc.edu.my" className="pl-9" maxLength={254}
              aria-invalid={error?.field === "email"} />
          </div>

          <label htmlFor="reset-barcode" className="mb-1.5 mt-4 block text-xs font-semibold" style={{ color: c.text }}>Student card barcode</label>
          <div className="relative">
            <CreditCard size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: c.textMuted }} />
            <VInput id="reset-barcode" type="text" inputMode="numeric" autoComplete="off"
              value={form.barcode}
              onChange={(event) => update("barcode", event.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              placeholder="10 digits on your card" className="pl-9" maxLength={10}
              aria-invalid={error?.field === "barcode"} aria-describedby={error ? "reset-error" : undefined} />
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: c.textLight }}>The 10-digit number under the barcode on your student ID.</p>

          {error && (
            <p id="reset-error" role="alert" className="mt-3 text-xs leading-relaxed" style={{ color: c.danger }}>
              {error.message}
            </p>
          )}

          <VButton type="submit" className="mt-5 w-full" disabled={submitting}>
            {submitting ? "Checking…" : "Continue"}
          </VButton>
          <p className="mt-3 text-center text-[11px] leading-relaxed" style={{ color: c.textLight }}>
            If your details match, you&apos;ll choose a new password on the next step.
          </p>
        </form>

        <div className="mt-6 border-t pt-4 text-center" style={{ borderColor: c.borderLight }}>
          <Link href="/login?skip=1" className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: c.primary }}>
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
