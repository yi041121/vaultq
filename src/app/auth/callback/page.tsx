"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { colors } from "@/lib/design";
import { markSessionActivity } from "@/lib/idle-session";
import { clearStudentCache } from "@/lib/student-cache";
import { getServerSession } from "@/lib/browser-session";
import { storeBrowserSession } from "@/lib/browser-session-store";

// Google establishes a server session first. No credentials/profile data are
// accepted from URL parameters or exposed in browser redirect history.
export default function AuthCallback() {
  const router = useRouter();
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    window.history.replaceState(null, "", "/auth/callback");
    void (async () => {
      try {
        const session = await getServerSession();
        if (cancelled) return;
        if (!session) { router.replace("/login?skip=1"); return; }
        clearStudentCache();
        storeBrowserSession(session);
        markSessionActivity();
        setSucceeded(true);
        timer = setTimeout(() => router.replace(session.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/student"), 800);
      } catch {
        if (!cancelled) router.replace("/login?skip=1&googleError=Could%20not%20complete%20sign-in.%20Please%20try%20again.");
      }
    })();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [router]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg }}>
      {/* Centered "Login successful" popup — identical style to the sign-in form */}
      {succeeded && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
          <div className="rounded-[20px] px-8 py-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
            style={{ background: colors.card, boxShadow: "0 20px 48px rgba(0,0,0,0.28)" }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: `color-mix(in srgb, #16a34a 14%, transparent)` }}>
              <CheckCircle2 size={30} style={{ color: "#16a34a" }} />
            </div>
            <p className="text-base font-semibold" style={{ color: colors.text }}>Login successful</p>
            <p className="text-xs mt-1" style={{ color: colors.textMuted }}>Redirecting...</p>
          </div>
        </div>
      )}
    </div>
  );
}
