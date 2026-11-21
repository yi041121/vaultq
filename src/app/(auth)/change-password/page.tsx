import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dal";
import ChangePasswordForm from "./change-password-form";

// Reached after signing in with a temporary password (or directly by a signed
// in user). The DAL read is authoritative, so a stale cookie cannot skip it.
export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?skip=1");
  if (!user.mustChangePassword) {
    redirect(user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/student");
  }
  return <ChangePasswordForm name={user.name} role={user.role} />;
}
