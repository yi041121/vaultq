import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { ImageValidationError, normalizeImageFile, normalizeImageSources } from "@/lib/image-validation";
import { ClaimTransitionError, resubmitRejectedClaim } from "@/lib/claim-transition-service";
import { NO_PHOTO_REASON_MIN_LENGTH } from "@/lib/claim-validation";
import { enforceAuthRateLimit } from "@/lib/auth-rate-limit";

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
  const limited = await enforceAuthRateLimit(request, "claim", user.id);
  if (limited) return limited;

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
    const noPhoto = form.get("noPhoto") === "true";
    if (!claimReason) {
      return NextResponse.json({ success: false, error: "Claim reason is required" }, { status: 400 });
    }

    let incomingKeep: unknown;
    try {
      incomingKeep = JSON.parse(String(form.get("keepImages") || "[]"));
    } catch {
      return NextResponse.json({ success: false, error: "Invalid retained photos" }, { status: 400 });
    }
    if (!Array.isArray(incomingKeep)) throw new ImageValidationError("Invalid retained photos");

    const files = form.getAll("evidence").filter((entry): entry is File => entry instanceof File);
    if (incomingKeep.length + files.length > 3) {
      return NextResponse.json({ success: false, error: "You can upload up to 3 photos" }, { status: 400 });
    }
    const keepImages = await normalizeImageSources(incomingKeep);

    const photos: string[] = [];
    for (const file of files) {
      photos.push(await normalizeImageFile(file));
    }

    const evidenceImageUrls = [...keepImages, ...photos].slice(0, 3);
    if (!evidenceImageUrls.length && !noPhoto) {
      return NextResponse.json({ success: false, error: "At least one evidence photo is required" }, { status: 400 });
    }
    if (!evidenceImageUrls.length && claimReason.length < NO_PHOTO_REASON_MIN_LENGTH) return NextResponse.json({ success: false, error: `Without a photo, provide at least ${NO_PHOTO_REASON_MIN_LENGTH} characters for in-person verification.` }, { status: 400 });

    const updated = await resubmitRejectedClaim(id, user.id, { claimReason, evidenceImageUrls, noPhoto });

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof ImageValidationError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    if (e instanceof ClaimTransitionError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("Claim resubmit failed", e);
    return NextResponse.json({ success: false, error: "Failed to resubmit claim" }, { status: 500 });
  }
}
