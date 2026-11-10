import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { signedImageUrl } from "@/lib/image-url";

/** Thrown when the item stops being available while a claim is submitted. */
class ClaimConflict extends Error {}

// GET /api/claims — list current user's claims or all for admin
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const claims = await prisma.claim.findMany({
      where: user.role === "ADMIN" ? {} : { userId: user.id },
      include: {
        item: {
          select: {
            id: true,
            itemName: true,
            category: true,
            description: true,
            foundLocation: true,
            foundDate: true,
            status: true,
            imageUrl: true,
            createdAt: true,
            locker: { select: { lockerNumber: true } },
            reports: {
              where: { type: "FOUND", status: "VERIFIED" },
              select: { id: true, imageUrls: true },
              take: 1,
            },
          },
        },
        user: { select: { name: true, studentId: true, email: true } },
        qrCode: { select: { expiresAt: true, isUsed: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Claims created by matching a lost report have no uploaded evidence, so
    // fall back to the photo the student attached to that lost report.
    const missingEvidence = claims.filter(
      (claim) => !claim.evidenceImageUrl && !(claim.evidenceImageUrls?.length > 0),
    );
    const reportPhotos = new Map<string, { photos: string[]; createdAt: string }>();
    if (missingEvidence.length) {
      const reports = await prisma.report.findMany({
        where: {
          type: "LOST",
          itemId: { in: Array.from(new Set(missingEvidence.map((c) => c.itemId))) },
          userId: { in: Array.from(new Set(missingEvidence.map((c) => c.userId))) },
        },
        select: { userId: true, itemId: true, imageUrl: true, imageUrls: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      for (const report of reports) {
        if (!report.itemId) continue;
        const photos = (
          Array.isArray(report.imageUrls) && report.imageUrls.length
            ? report.imageUrls
            : report.imageUrl
              ? [report.imageUrl]
              : []
        ).filter(Boolean).slice(0, 3);
        if (!photos.length) continue;
        const key = `${report.userId}:${report.itemId}`;
        if (!reportPhotos.has(key)) {
          reportPhotos.set(key, {
            photos,
            createdAt: report.createdAt ? new Date(report.createdAt).toISOString() : "",
          });
        }
      }
    }

    const matchedReportIds = claims
      .map((claim) => claim.matchedReportId)
      .filter((id): id is string => !!id);
    const matchedReportDescriptions = new Map<string, string>();
    if (matchedReportIds.length) {
      const matchedReports = await prisma.report.findMany({
        where: { id: { in: matchedReportIds } },
        select: { id: true, description: true },
      });
      for (const report of matchedReports) {
        if (report.description) matchedReportDescriptions.set(report.id, report.description);
      }
    }

    const claimsWithEvidence = claims.map((claim) => {
      const hasOwnEvidence = claim.evidenceImageUrls?.length > 0 || !!claim.evidenceImageUrl;
      const fallback = reportPhotos.get(`${claim.userId}:${claim.itemId}`);
      const photos = hasOwnEvidence
        ? claim.evidenceImageUrls?.length
          ? claim.evidenceImageUrls
          : [claim.evidenceImageUrl!]
        : fallback?.photos || [];
      return {
        ...claim,
        evidenceImageUrls: photos,
        evidenceImageUrl: claim.evidenceImageUrl || photos[0] || null,
        // Uploaded evidence uses the claim time; matched claims use the
        // moment the student submitted the original lost report.
        evidenceUploadedAt: hasOwnEvidence
          ? claim.createdAt
            ? new Date(claim.createdAt).toISOString()
            : ""
          : fallback?.createdAt || (claim.createdAt ? new Date(claim.createdAt).toISOString() : ""),
        matchedReportDescription: claim.matchedReportId
          ? matchedReportDescriptions.get(claim.matchedReportId) || null
          : null,
      };
    });

    // Locker numbers are only revealed once the claim is approved.
    let data: any[] =
      user.role === "STUDENT"
        ? claimsWithEvidence.map((claim) =>
            claim.status === "APPROVED"
              ? claim
              : { ...claim, item: { ...claim.item, locker: null } },
          )
        : claimsWithEvidence;

    // Admin verification queue: send signed image URLs instead of megabytes of
    // base64 data. The browser can lazy-load only the photos it actually shows.
    if (new URL(request.url).searchParams.get("light") === "1") {
      data = data.map((claim: any) => {
        const evidenceSources: string[] = claim.evidenceImageUrls?.length
          ? claim.evidenceImageUrls
          : claim.evidenceImageUrl
            ? [claim.evidenceImageUrl]
            : [];
        const evidenceUrls = evidenceSources
          .map((source, index) => signedImageUrl("claim", claim.id, index, source))
          .filter(Boolean);
        const foundReport = claim.item?.reports?.[0];
        const itemReportUrls = Array.isArray(foundReport?.imageUrls)
          ? foundReport.imageUrls
              .map((source: string, index: number) => signedImageUrl("report", foundReport.id, index, source))
              .filter(Boolean)
          : [];
        const itemMain = claim.item?.imageUrl
          ? signedImageUrl("item", claim.itemId, 0, claim.item.imageUrl)
          : "";
        const itemUrls = Array.from(new Set([itemMain, ...itemReportUrls].filter(Boolean)));
        return {
          ...claim,
          evidenceImageUrls: evidenceUrls,
          evidenceImageUrl: evidenceUrls[0] || null,
          item: claim.item
            ? {
                ...claim.item,
                imageUrl: itemUrls[0] || null,
                reports: foundReport
                  ? [{ ...foundReport, imageUrls: itemReportUrls }]
                  : [],
              }
            : claim.item,
        };
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("Claims list failed", e);
    return NextResponse.json({ success: false, error: "Failed to list claims" }, { status: 500 });
  }
}

// POST /api/claims — student claims a found item with photo evidence
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STUDENT") return NextResponse.json({ success: false, error: "Only students can claim" }, { status: 403 });

  try {
    let itemId: string | null = null;
    let claimReason: string | null = null;
    let reportId: string | null = null;
    const evidenceImageUrls: string[] = [];

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      itemId = form.get("itemId") as string | null;
      claimReason = form.get("claimReason") as string | null;
      reportId = (form.get("reportId") as string | null) || null;
      const files = form.getAll("evidence").filter((entry): entry is File => entry instanceof File);
      if (files.length > 3) {
        return NextResponse.json({ success: false, error: "You can upload up to 3 photos" }, { status: 400 });
      }
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          return NextResponse.json({ success: false, error: "Evidence must be an image" }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ success: false, error: "Each image must be under 5MB" }, { status: 400 });
        }
        // For demo: store as data URL (in production, upload to S3/R2)
        const buf = Buffer.from(await file.arrayBuffer());
        evidenceImageUrls.push(`data:${file.type};base64,${buf.toString("base64")}`);
      }
    } else {
      const body = await request.json();
      itemId = body.itemId;
      claimReason = body.claimReason;
      reportId = typeof body.reportId === "string" ? body.reportId : null;
      const incoming = Array.isArray(body.evidenceImageUrls)
        ? body.evidenceImageUrls
        : body.evidenceImageUrl
          ? [body.evidenceImageUrl]
          : [];
      for (const value of incoming.slice(0, 3)) {
        if (typeof value === "string" && value.startsWith("data:image/")) evidenceImageUrls.push(value);
      }
    }

    if (!itemId) return NextResponse.json({ success: false, error: "itemId required" }, { status: 400 });
    if (!claimReason?.trim()) return NextResponse.json({ success: false, error: "claimReason required" }, { status: 400 });
    if (!evidenceImageUrls.length) return NextResponse.json({ success: false, error: "Photo evidence is required" }, { status: 400 });

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    if (item.status !== "FOUND") return NextResponse.json({ success: false, error: "Item not available for claim" }, { status: 400 });

    // A student cannot claim the item they handed in themselves.
    const ownFoundReport = await prisma.report.findFirst({
      where: { itemId, userId: user.id, type: "FOUND", status: "VERIFIED" },
      select: { id: true },
    });
    if (ownFoundReport) {
      return NextResponse.json(
        { success: false, error: "You cannot claim an item you reported as found" },
        { status: 403 },
      );
    }

    // An approved claim already owns this item — block further claims.
    const approved = await prisma.claim.findFirst({ where: { itemId, status: "APPROVED" } });
    if (approved) return NextResponse.json({ success: false, error: "Item already claimed" }, { status: 400 });

    const existing = await prisma.claim.findFirst({ where: { itemId, userId: user.id, status: "PENDING" } });
    if (existing) return NextResponse.json({ success: false, error: "You already have a pending claim for this item" }, { status: 409 });

    // Linking is explicit: the student is asked which lost report to link
    // before the claim form opens. If they skip it, no report is attached.
    let linkedReport: { id: string } | null = null;
    if (reportId) {
      const report = await prisma.report.findUnique({ where: { id: reportId } });
      if (!report || report.userId !== user.id || report.type !== "LOST" || report.status !== "PENDING") {
        return NextResponse.json({ success: false, error: "Invalid lost report to link" }, { status: 400 });
      }
      linkedReport = { id: report.id };
    }

    const claim = await prisma.$transaction(async (tx) => {
      // Serialize with approval: either this claim is inserted before the
      // winner is chosen (and gets auto-rejected), or the item is no longer
      // FOUND and the claim is refused. Without this lock, a claim could slip
      // in after the approval transaction read the rival claims.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "items" WHERE id = ${itemId} AND status = 'FOUND' FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new ClaimConflict("Item is no longer available for claim");
      }

      const created = await tx.claim.create({
        data: {
          itemId,
          userId: user.id,
          claimReason: claimReason.trim(),
          evidenceImageUrl: evidenceImageUrls[0],
          evidenceImageUrls,
          matchedReportId: linkedReport?.id || null,
        },
      });
      if (linkedReport) {
        // Linking moves the lost report out of the lost queue; the claim it
        // created still needs admin approval before the report is closed.
        await tx.report.update({
          where: { id: linkedReport.id },
          data: { status: "MATCHED", itemId, reviewedAt: null, reviewedById: null },
        });
      }
      return created;
    });

    // Notify the student that the claim was received.
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Claim Submitted",
        message: `Your claim for ${item.itemName} with evidence is awaiting verification.`,
        type: "CLAIM",
        link: "/dashboard/student/claims",
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: claim }, { status: 201 });
  } catch (e) {
    if (e instanceof ClaimConflict) {
      return NextResponse.json({ success: false, error: e.message }, { status: 409 });
    }
    console.error("Claim creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to create claim" }, { status: 500 });
  }
}
