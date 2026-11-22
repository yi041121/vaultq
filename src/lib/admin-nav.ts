import {
  BarChart3,
  FileText,
  Grid3X3,
  History,
  Lock,
  Package,
  PackageSearch,
  Users,
} from "lucide-react";

// One navigation definition for every administrator page, so a new section is
// added in exactly one place and the sidebar order never drifts.
export const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Intake", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Reports", icon: BarChart3, path: "/dashboard/admin/analytics" },
  { label: "Activity", icon: History, path: "/dashboard/admin/activity" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];
