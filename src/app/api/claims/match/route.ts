import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { notifyUser, notifyUsers } from "@/lib/notification-service";
import { ImageValidationError } from "@/lib/image-validation";
import { matchLostReport, ClaimReviewError, isReviewWriteConflict } from "@/lib/claim-review-service";

// POST /api/claims/match — admin links a lost report to a found item. The
// claim is approved immediately (locker assigned, pickup QR ready), so the
// admin does not need to approve it again in the Claims queue.
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  try {
    const body = await request.json().catch(() => null);
    const reportId = typeof body?.reportId === "string" ? body.reportId.trim() : null;
    const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : null;
    if (!reportId || !itemId || reportId.length > 128 || itemId.length > 128) {
      return NextResponse.json({ success: false, error: "reportId and itemId are required" }, { status: 400 });
    }

    const { created: claim, otherPending: rivals, matchedReports: rivalReports, itemName, reportName, userId, locker } = await matchLostReport(reportId, itemId, user.id);
    const lockerNote = locker ? ` Locker ${locker} is assigned.` : "";

    await notifyUsers(
      rivals.map((c) => ({
        userId: c.userId,
        title: "Claim Rejected",
        message: `Your claim for ${itemName} was rejected because the item has been claimed by another student.`,
        type: "CLAIM" as const,
        link: "/dashboard/student/claims",
      })),
    );

    await notifyUsers(
      rivalReports
        .filter((r) => r.userId !== userId)
        .map((r) => ({
          userId: r.userId,
          title: "Lost Report Closed",
          message: `The item you reported lost (${itemName}) has been claimed by another student, so your report was closed.`,
          type: "REPORT" as const,
          link: "/dashboard/student/report?tab=reports&kind=LOST",
        })),
    );

    await notifyUser(
      userId,
      "Lost Item Matched — Claim Approved",
      `Your lost report for ${reportName} was matched to a found item and approved.${lockerNote} View your pickup QR code in My Claims. At the locker kiosk, scan your student card barcode (or show the barcode from your Profile), then scan the QR code to open the locker and collect your item.`,
      { type: "CLAIM", link: "/dashboard/student/claims" },
    );

    return NextResponse.json(
      { success: true, data: { ...claim, locker } },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ImageValidationError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (e instanceof ClaimReviewError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (isReviewWriteConflict(e)) return NextResponse.json({ success: false, error: "Another review changed this item or locker. Please refresh." }, { status: 409 });
    console.error("Claim match failed", e);
    return NextResponse.json({ success: false, error: "Failed to match claim" }, { status: 500 });
  }
}
