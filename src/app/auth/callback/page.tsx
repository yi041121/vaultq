"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

// Landing point after Google OAuth succeeds. The API callback hands us the
// app JWT via query params; we store it exactly like the email/password
// login does, show the same centered "Login successful" popup, then
// continue into the dashboard.
export default function AuthCallback() {
  const router = useRouter();
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const token = sp.get("token");
    const id = sp.get("id");
    const name = sp.get("name");
    const email = sp.get("email");
    const role = sp.get("role");
    const barcode = sp.get("barcode");

    if (token && id && role) {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify({ id, name, email, role, cardBarcode: barcode || null }));
      // Same centered "Login successful" popup as the sign-in form, then redirect
      setSucceeded(true);
      setTimeout(() => {
        router.replace(role === "ADMIN" ? "/dashboard/admin" : "/dashboard/student");
      }, 800);
    } else {
      router.replace("/login?skip=1");
    }
  }, [router]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F3" }}>
      {/* Centered "Login successful" popup — identical style to the sign-in form */}
      {succeeded && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ backgroundColor: "rgba(15,23,42,0.35)" }}>
          <div className="rounded-[20px] px-8 py-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
            style={{ background: "white", boxShadow: "0 20px 48px rgba(53,92,138,0.18)" }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "#f0fdf4" }}>
              <CheckCircle2 size={30} style={{ color: "#16a34a" }} />
            </div>
            <p className="text-base font-semibold" style={{ color: "#0f172a" }}>Login successful</p>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>Redirecting...</p>
          </div>
        </div>
      )}
    </div>
  );
}
