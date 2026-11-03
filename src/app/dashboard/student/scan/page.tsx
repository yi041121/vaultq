import { redirect } from "next/navigation";

// Pickup is staff-assisted: students present the QR code from My Claims and a
// staff member or kiosk scans it. There is nothing for the student device to
// scan, so old links fall back to the claims page.
export default function StudentScanPage() {
  redirect("/dashboard/student/claims");
}
