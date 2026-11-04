import {
  BookText, Briefcase, CreditCard, CupSoda, Grid3X3, Key, Monitor, type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Electronics: Monitor,
  Bags: Briefcase,
  "Student Cards": CreditCard,
  Keys: Key,
  Documents: BookText,
  "Water Bottles": CupSoda,
  Others: Grid3X3,
};

/** Icon for a report/item category, falling back to a generic grid. */
export function categoryIcon(category: string | null | undefined): LucideIcon {
  return (category && CATEGORY_ICONS[category]) || Grid3X3;
}
