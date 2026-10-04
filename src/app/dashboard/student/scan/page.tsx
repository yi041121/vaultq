"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Scan, CheckCircle2, AlertCircle, Lock, Package } from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import { VCard, VButton, VInput, vcolors as c } from "@/components/ui/vault";
import BarcodeScanner from "@/components/barcode-scanner";

interface User { id: string; name: string; email: string; role: string; }

export default function StudentScan() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [result, setResult] = useState<{ success: boolean; locker?: string; claimId?: string; message: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    const t = localStorage.getItem("token");
    if (!s || !t) setUser({ id: "1", name: "Student User", email: "student@example.com", role: "STUDENT" });
    else setUser(JSON.parse(s));
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out");
    router.push("/login?skip=1");
  }

  function verifyToken(token: string) {
    const t = token.trim();
    if (!t) {
      toast.error("Please enter or scan a token");
      return;
    }
    // Check localStorage mock
    try {
      const store = JSON.parse(localStorage.getItem("vaultq_qr") || "{}") as Record<string, { token: string; locker: string; expiresAt: string }>;
      let found: { claimId: string; locker: string; expiresAt: string } | null = null;
      for (const [claimId, v] of Object.entries(store)) {
        if (v.token === t) {
          found = { claimId, locker: v.locker, expiresAt: v.expiresAt };
          break;
        }
      }
      // Also check if token looks like vaultq-... (mock generated)
      if (!found && t.startsWith("vaultq-")) {
        // Try to parse claimId from token: vaultq-CLM-xxx-...
        const m = t.match(/vaultq-(CLM-[^-]+)/);
        const claimId = m ? m[1] : t.slice(0, 12);
        found = { claimId, locker: "A12", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
      }

      if (!found) {
        setResult({ success: false, message: "Invalid or unknown QR token. Please check and try again." });
        toast.error("Invalid QR token");
        return;
      }
      if (new Date(found.expiresAt).getTime() < Date.now()) {
        setResult({ success: false, message: "QR has expired. Please request a new one from My Claims." });
        toast.error("QR expired");
        return;
      }
      // Check if already used (mock)
      const usedKey = `vaultq_qr_used_${t}`;
      if (localStorage.getItem(usedKey)) {
        setResult({ success: false, message: "QR already used. Locker already opened." });
        toast.error("QR already used");
        return;
      }
      localStorage.setItem(usedKey, "1");
      // Mark claim as collected (mock)
      try {
        const claims = JSON.parse(localStorage.getItem("vaultq_claims") || "[]");
        const updated = claims.map((cl: any) => cl.id === found!.claimId ? { ...cl, status: "Collected" } : cl);
        localStorage.setItem("vaultq_claims", JSON.stringify(updated));
      } catch {}
      setResult({ success: true, locker: found.locker, claimId: found.claimId, message: `Locker ${found.locker} unlocked! Please collect your item.` });
      toast.success(`Locker ${found.locker} opened`);
      // Also try real API verification
      const tokenAuth = localStorage.getItem("token");
      fetch("/api/qrcode/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(tokenAuth ? { Authorization: `Bearer ${tokenAuth}` } : {}) },
        body: JSON.stringify({ token: t }),
      }).catch(() => {});
    } catch {
      setResult({ success: false, message: "Verification failed. Please try again." });
    }
  }

  if (!user || !mounted) return null;

  return (
    <StudentShell active="Home" userName={user.name} userRole={user.role} pageTitle="Scan QR Code" logout={handleLogout}>
      <main className="min-h-[calc(100vh-52px)] pb-6 lg:pb-6">
        <div className="px-4 lg:px-10 pt-4 lg:pt-5 w-full max-w-2xl mx-auto">
          <VCard className="p-6 lg:p-8 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${c.primary}15` }}>
              <QrCode size={28} style={{ color: c.primary }} />
            </div>
            <h2 className="text-base font-semibold mb-1" style={{ color: c.text }}>Scan Locker QR</h2>
            <p className="text-sm mb-6" style={{ color: c.textMuted }}>Scan the QR from My Claims at the kiosk to unlock your locker.</p>

            <button type="button" onClick={() => setScanOpen(true)}
              className="w-full h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors duration-200 cursor-pointer mb-6"
              style={{ borderColor: c.border, backgroundColor: c.fill, color: c.textMuted }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.primary; e.currentTarget.style.color = c.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textMuted; }}>
              <Scan size={28} />
              <span className="text-sm font-medium">Tap to scan QR with camera</span>
              <span className="text-xs" style={{ color: c.textLight }}>or enter token manually below</span>
            </button>

            <div className="flex gap-2 mb-4">
              <VInput value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="Paste QR token e.g. vaultq-CLM-..." className="flex-1" />
              <VButton onClick={() => verifyToken(manualToken)}>Verify</VButton>
            </div>

            {result && (
              <div className={`rounded-xl p-4 flex items-start gap-3 text-left ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {result.success ? <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" /> : <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${result.success ? "text-green-800" : "text-red-800"}`}>{result.success ? "Success" : "Failed"}</p>
                  <p className={`text-xs mt-1 ${result.success ? "text-green-700" : "text-red-700"}`}>{result.message}</p>
                  {result.success && result.locker && (
                    <p className="text-xs mt-2 flex items-center gap-1.5 font-medium" style={{ color: c.primary }}><Lock size={12} /> Locker {result.locker} · {result.claimId}</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 p-3 rounded-xl flex items-start gap-2.5 text-left" style={{ backgroundColor: c.fill }}>
              <Package size={16} className="shrink-0 mt-0.5" style={{ color: c.textMuted }} />
              <p className="text-xs leading-relaxed" style={{ color: c.textMuted }}>
                After your claim is <b style={{ color: c.text }}>QR Ready</b>, open <b style={{ color: c.text }}>My Claims → View QR</b> to get your QR. Scan it here (or at the physical kiosk) within 24h to retrieve your item.
              </p>
            </div>
          </VCard>
        </div>
      </main>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetect={(code) => { setManualToken(code); verifyToken(code); setScanOpen(false); }} />
    </StudentShell>
  );
}
