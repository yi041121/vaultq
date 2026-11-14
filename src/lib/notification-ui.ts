import { BellRing, CheckCircle2, FileText, Package } from "lucide-react";
import { formatDisplayDate } from "./date-format";

export type NotificationType = "CLAIM" | "REPORT" | "LOCKER" | "SYSTEM";
export type NotificationCategory = "Claims" | "Reports" | "Locker" | "System";

export const NOTIFICATION_META: Record<
  NotificationType,
  { category: NotificationCategory; icon: typeof BellRing; color: string }
> = {
  CLAIM: { category: "Claims", icon: CheckCircle2, color: "#7FB8B5" },
  REPORT: { category: "Reports", icon: FileText, color: "#355C8A" },
  LOCKER: { category: "Locker", icon: Package, color: "#29486A" },
  SYSTEM: { category: "System", icon: BellRing, color: "#64748b" },
};

export function relativeTime(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 45_000) return "Just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDisplayDate(value);
}
