"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, Grid3X3, Lock, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "@/components/student-shell";
import { VCard, vcolors as c } from "@/components/ui/vault";
const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];
export default function AdminAccounts() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
  }, []);
  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); toast.success("Logged out"); router.push("/login?skip=1"); }
  if (!user || !mounted) return null;
  return (
    <StudentShell active="Accounts" userName={user.name} userRole={user.role} pageTitle="Account Management" bottomNav={adminNav} logout={handleLogout}>
      <main className="pb-6 lg:pb-6"><div className="px-6 lg:px-12 pt-5 lg:pt-6 w-full"><VCard className="p-10 text-center"><Users size={40} className="mx-auto mb-4" style={{ color: c.textLight }} /><p className="text-sm" style={{ color: c.textMuted }}>Student account management coming soon.</p></VCard></div></main>
    </StudentShell>
  );
}
