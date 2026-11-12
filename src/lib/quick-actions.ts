import type { ComponentType, CSSProperties } from "react";
import {
  AlertCircle, ClipboardList, FileText, Lock, PlusCircle, Shield, Users,
} from "lucide-react";

export interface QuickAction {
  label: string;
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  desc: string;
  path: string;
}

export const studentQuickActions: QuickAction[] = [
  { label: "Report Lost Item", icon: AlertCircle, desc: "Submit a lost item report", path: "/dashboard/student/report?tab=new&type=lost" },
  { label: "Report Found Item", icon: PlusCircle, desc: "Log a found item", path: "/dashboard/student/report?tab=new&type=found" },
  { label: "My Claims", icon: FileText, desc: "Track your claims", path: "/dashboard/student/claims" },
  { label: "My Reports", icon: ClipboardList, desc: "Track lost & found reports", path: "/dashboard/student/report?tab=reports" },
];

export const adminQuickActions: QuickAction[] = [
  { label: "Verify Claims", icon: Shield, desc: "Review pending", path: "/dashboard/admin/claims" },
  { label: "Register Item", icon: PlusCircle, desc: "Add found item", path: "/dashboard/admin/items?add=1" },
  { label: "Manage Lockers", icon: Lock, desc: "Assign lockers", path: "/dashboard/admin/lockers" },
  { label: "Manage Accounts", icon: Users, desc: "Student accounts", path: "/dashboard/admin/accounts" },
];

export function quickActionsForRole(role: string): QuickAction[] {
  return role === "ADMIN" ? adminQuickActions : studentQuickActions;
}
