import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/claims/:id/resubmit — the owner edits a rejected claim (reason and
// optionally photos) and sends it back for review.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STUDENT") {
    return NextResponse.json({ success: false, error: "Only students can resubmit" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const claim = await prisma.claim.findUnique({ where: { id } });
    if (!claim) return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    if (claim.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your claim" }, { status: 403 });
    }
    if (claim.status !== "REJECTED") {
      return NextResponse.json({ success: false, error: "Only rejected claims can be resubmitted" }, { status: 409 });
    }

    const form = await request.formData();
    const claimReason = String(form.get("claimReason") || "").trim();
    if (!claimReason) {
      return NextResponse.json({ success: false, error: "Claim reason is required" }, { status: 400 });
    }

    let keepImages: string[] = [];
    try {
      const rawKeep = JSON.parse(String(form.get("keepImages") || "[]"));
      if (Array.isArray(rawKeep)) {
        keepImages = rawKeep.filter(
          (value): value is string => typeof value === "string" && value.startsWith("data:image/"),
        );
      }
    } catch {
      keepImages = [];
    }

    const files = form.getAll("evidence").filter((entry): entry is File => entry instanceof File);
    if (keepImages.length + files.length > 3) {
      return NextResponse.json({ success: false, error: "You can upload up to 3 photos" }, { status: 400 });
    }

    const photos: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ success: false, error: "Evidence must be an image" }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: "Each image must be under 5MB" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      photos.push(`data:${file.type};base64,${buf.toString("base64")}`);
    }

    const evidenceImageUrls = [...keepImages, ...photos].slice(0, 3);
    if (!evidenceImageUrls.length) {
      return NextResponse.json({ success: false, error: "At least one evidence photo is required" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.claim.update({
        where: { id },
        data: {
          claimReason,
          evidenceImageUrl: evidenceImageUrls[0] || null,
          evidenceImageUrls,
          status: "PENDING",
          approvedAt: null,
          adminNote: null,
        },
      });
      // Re-attach the linked lost report: rejecting the claim released it back
      // to Pending, so a resubmission matches it again for admin review.
      if (claim.matchedReportId) {
        await tx.report.updateMany({
          where: { id: claim.matchedReportId, type: "LOST", status: "PENDING" },
          data: { status: "MATCHED", itemId: claim.itemId, reviewedAt: null, reviewedById: null },
        });
      }
      return next;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("Claim resubmit failed", e);
    return NextResponse.json({ success: false, error: "Failed to resubmit claim" }, { status: 500 });
  }
}
