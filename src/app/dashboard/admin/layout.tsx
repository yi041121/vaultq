import { requireSession } from "@/lib/dal";

// Authoritative guard for every admin dashboard route. Proxy performs only an
// optimistic signed-token check; this server layout confirms the persisted
// session, account activity and current role before rendering any page.
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireSession("ADMIN");
  return children;
}
