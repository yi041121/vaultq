import { requireSession } from "@/lib/dal";

// Authoritative guard for every student dashboard route. Proxy performs only
// an optimistic signed-token check; this server layout confirms the persisted
// session, account activity and current role before rendering any page.
export default async function StudentDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireSession("STUDENT");
  return children;
}
