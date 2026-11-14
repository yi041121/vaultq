import { NO_PHOTO_REASON_MIN_LENGTH } from "./claim-validation";

export interface AssistantOption {
  label: string;
  next: string;
}

export interface AssistantNode {
  message: string;
  options?: readonly AssistantOption[];
  action?: { label: string; path: string };
}

export type AssistantFlow = Readonly<Record<string, AssistantNode>>;

const studentFlow: AssistantFlow = {
  home: {
    message: "Hi! I’m the VaultQ guide. Choose a topic below—no typing needed. I can explain the steps and take you to the right screen. I cannot approve claims or verify ownership.",
    options: [
      { label: "I lost something", next: "lost" },
      { label: "I found something", next: "found" },
      { label: "Help me claim an item", next: "claim" },
      { label: "Check my claims or reports", next: "status" },
      { label: "How do I collect my item?", next: "collect" },
    ],
  },
  lost: {
    message: "First, check Search for a matching found item. Use the item name, category, location and date to narrow the list. If nothing matches, submit a lost report with distinctive details.",
    action: { label: "Search found items", path: "/dashboard/student/search" },
    options: [{ label: "No match—report my lost item", next: "report" }, { label: "I found a match", next: "claim" }],
  },
  report: {
    message: "Describe what you lost, when and where you last saw it, and details that distinguish it from similar items. Add your own photos if available. An admin will review possible matches; a report does not guarantee ownership approval.",
    action: { label: "Report a lost item", path: "/dashboard/student/report?tab=new&type=lost" },
  },
  found: {
    message: "Submit a found-item report with the item’s details, photos, and where and when you found it. Follow the handover instructions shown in the report workflow. Admins review the report before making the item available for claims.",
    action: { label: "Report a found item", path: "/dashboard/student/report?tab=new&type=found" },
  },
  claim: {
    message: "Open the matching item in Search and choose Claim. Link your matching pending lost report if you have one, then review the ownership details and evidence. Photo evidence is required by default. Submission is not approval—an admin makes the final decision.",
    action: { label: "Find the item to claim", path: "/dashboard/student/search" },
    options: [{ label: "I don’t have a photo", next: "noPhoto" }, { label: "Should I link my lost report?", next: "link" }],
  },
  noPhoto: {
    message: `In the claim form, choose “I don’t have a photo of this item”. Provide at least ${NO_PHOTO_REASON_MIN_LENGTH} characters of ownership details, such as unique marks, contents or identifying features. The admin must verify ownership in person; this option does not guarantee approval.`,
    action: { label: "Open item search", path: "/dashboard/student/search" },
  },
  link: {
    message: "Link the pending lost report that describes this same item. Its details and photos can be copied into your claim for review. Only skip linking if the item is not from your pending reports, and confirm that in the form. Unlinked lost reports stay pending for admin review—they are not automatically closed.",
    action: { label: "View my reports", path: "/dashboard/student/report?tab=reports" },
  },
  status: {
    message: "Choose which records to open. This guide does not display live status; your Claims and Reports screens show your current records. Check Notifications for updates and admin instructions.",
    options: [{ label: "My claims", next: "claims" }, { label: "My reports", next: "reports" }, { label: "My notifications", next: "notifications" }],
  },
  claims: {
    message: "Open My Claims to see the status and any admin notes. Pending means it still needs review. If rejected, read the reason before deciding what to do next. Only follow collection instructions after approval.",
    action: { label: "Open my claims", path: "/dashboard/student/claims" },
  },
  reports: {
    message: "Open My Reports to track your lost and found reports. For a pending lost report, choose Check possible matches to review available items and start a linked claim. Suggestions do not prove ownership. An unlinked lost report can remain pending even if you submitted a separate claim; the admin reviews and resolves it.",
    action: { label: "Open my reports", path: "/dashboard/student/report?tab=reports" },
  },
  notifications: {
    message: "Your notifications contain claim and report updates. Open the relevant record to review the latest details before acting.",
    action: { label: "Open notifications", path: "/dashboard/student/notifications" },
  },
  collect: {
    message: "Open your approved claim and follow its collection instructions. Keep any collection code or QR code private. If the locker or collection process fails, ask the responsible admin for help. This guide cannot unlock lockers or issue collection codes.",
    action: { label: "View collection instructions", path: "/dashboard/student/claims" },
  },
};

const adminFlow: AssistantFlow = {
  home: {
    message: "Hi! I’m the VaultQ admin guide. Select a topic for workflow guidance. I cannot approve or reject claims, match or close reports, or unlock lockers. Final decisions stay with you.",
    options: [
      { label: "Review claims", next: "review" },
      { label: "Review lost reports and matches", next: "matches" },
      { label: "Review found-item intake", next: "intake" },
      { label: "Manage inventory", next: "inventory" },
      { label: "Manage lockers", next: "lockers" },
      { label: "Manage student accounts", next: "accounts" },
    ],
  },
  review: {
    message: "Open Claim Verification to review the claimant’s explanation and evidence against the item. Check competing claims before deciding. Use the existing review controls to approve or reject—this guide makes no changes.",
    action: { label: "Open claim verification", path: "/dashboard/admin/claims" },
    options: [{ label: "The claim has no photo", next: "noPhoto" }, { label: "There is an unlinked lost report", next: "matches" }],
  },
  noPhoto: {
    message: `A no-photo claim requires at least ${NO_PHOTO_REASON_MIN_LENGTH} characters of ownership detail. The “No photo — verify in person” badge flags it for you. Verify distinctive details with the claimant in person before deciding. A long explanation alone is not proof of ownership.`,
    action: { label: "Review claims", path: "/dashboard/admin/claims" },
  },
  matches: {
    message: "Review lost reports and compare their identifying details with found items. Treat suggested matches as guidance, not proof. Confirming Match & approve immediately approves the claim, closes the selected report and enables collection—verify ownership first. Unlinked pending lost reports are not automatically closed when a separate claim is approved. The final decision is yours.",
    action: { label: "Open claims and lost reports", path: "/dashboard/admin/claims" },
  },
  intake: {
    message: "Review submitted found-item reports in Intake. Check the details, photos and physical handover before using the available verification controls. Do not mark an item as received based only on this guide.",
    action: { label: "Open intake", path: "/dashboard/admin/reports" },
  },
  inventory: {
    message: "Use Inventory to inspect and manage found items. Check the item’s current status before editing. Claimed or retrieved inventory is protected from edits and deletion by the existing workflow.",
    action: { label: "Open inventory", path: "/dashboard/admin/items" },
  },
  lockers: {
    message: "Use Lockers to inspect availability and assignments. Confirm the physical locker state before making changes. This guide cannot operate hardware or override an assignment.",
    action: { label: "Open lockers", path: "/dashboard/admin/lockers" },
  },
  accounts: {
    message: "Use Accounts for student account management. Verify the student’s identity before changing their details, and keep personal information private.",
    action: { label: "Open accounts", path: "/dashboard/admin/accounts" },
  },
};

// Unknown roles receive no menu; role-specific navigation is not authorization.
// Existing pages and APIs remain responsible for enforcing access.
export function assistantFlowForRole(role: string): AssistantFlow | null {
  if (role === "STUDENT") return studentFlow;
  if (role === "ADMIN") return adminFlow;
  return null;
}
