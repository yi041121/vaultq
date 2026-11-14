/** Explain the next action, without treating a suggestion as ownership approval. */
export function reportNextStep(type: string, status: string): string {
  if (status === "PENDING") return type === "LOST"
    ? "Next: check possible matches. If an item is yours, start a claim. Your report stays pending until reviewed."
    : "Next: hand the item to the Lost & Found office. Staff will verify it before it enters inventory.";
  if (status === "MATCHED") return "Next: check My Claims for a linked claim and its status. A matched report alone does not mean you can collect the item.";
  if (status === "VERIFIED") return "Staff verified your report. No action is needed from you unless an admin contacts you.";
  if (status === "REJECTED") return "Next: read the admin note. Contact the Lost & Found office if you need clarification.";
  if (status === "CLOSED") return "This report is closed. If you have a claim, check My Claims for approval and collection instructions.";
  return "Check your notifications for updates from the Lost & Found office.";
}

export function claimNextStep(status: string): string {
  switch (status) {
    case "Pending": return "Next: wait for admin review. Keep your ownership evidence ready; do not collect the item yet.";
    case "QR Ready": return "Approved. Next: open your pickup QR and follow the collection instructions. Keep the QR private.";
    case "Collected": return "Collection completed. No further action is needed.";
    case "Rejected": return "Next: open Details to read the rejection reason before editing and resubmitting your evidence.";
    default: return "Open Details to check the latest claim information.";
  }
}
