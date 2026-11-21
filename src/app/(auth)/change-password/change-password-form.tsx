"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { VButton, VCard, VInput, vcolors as c } from "@/components/ui/vault";
import { getBrowserSessionKey } from "@/lib/browser-session-store";

export default function ChangePasswordForm({ name, role }: { name: string; role: "ADMIN" | "STUDENT" }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (newPassword.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a password different from the temporary one.");
      return;
    }

    const token = getBrowserSessionKey();
    if (!token) {
      setError("Your session expired. Please sign in again.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VaultQ-Request": "1",
          "X-VaultQ-Session": token,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not change the password");

      setDone(true);
      // Full navigation so every cached dashboard read starts from the new
      // session state instead of the pre-change render.
      setTimeout(() => {
        window.location.href = role === "ADMIN" ? "/dashboard/admin" : "/dashboard/student";
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4" style={{ backgroundColor: c.bg }}>
      <VCard className="w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.primarySoft, color: c.primary }}>
            <KeyRound size={18} />
          </span>
          <h1 className="text-xl font-bold" style={{ color: c.text }}>Set a new password</h1>
        </div>
        <p className="text-sm mb-6" style={{ color: c.textMuted }}>
          Hello {name}. You signed in with a temporary password, so choose a new one to continue.
        </p>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
            <CheckCircle2 size={40} style={{ color: c.accent }} />
            <p className="text-sm font-semibold" style={{ color: c.text }}>Password updated</p>
            <p className="text-xs" style={{ color: c.textMuted }}>Taking you to your dashboard…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                Temporary password <span style={{ color: c.danger }} aria-hidden="true">*</span>
              </label>
              <VInput id="current-password" type={show ? "text" : "password"} autoComplete="current-password"
                value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>

            <div>
              <label htmlFor="new-password" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                New password <span style={{ color: c.danger }} aria-hidden="true">*</span>
              </label>
              <VInput id="new-password" type={show ? "text" : "password"} autoComplete="new-password"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>

            <div>
              <label htmlFor="confirm-password" className="text-sm font-medium mb-1.5 block" style={{ color: c.text }}>
                Confirm new password <span style={{ color: c.danger }} aria-hidden="true">*</span>
              </label>
              <VInput id="confirm-password" type={show ? "text" : "password"} autoComplete="new-password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>

            <button type="button" onClick={() => setShow((value) => !value)}
              className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              style={{ color: c.primary }}>
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
              {show ? "Hide passwords" : "Show passwords"}
            </button>

            {error && <p role="alert" className="text-xs" style={{ color: c.danger }}>{error}</p>}

            <VButton type="submit" size="lg" className="w-full" disabled={busy || !currentPassword || !newPassword || !confirmPassword}>
              {busy ? "Saving…" : "Update password"}
            </VButton>
          </form>
        )}
      </VCard>
    </div>
  );
}
