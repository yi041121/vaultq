import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

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
            locker: { select: { lockerNumber: true } },
          },
        },
        user: { select: { name: true, studentId: true, email: true } },
        qrCode: { select: { expiresAt: true, isUsed: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Locker numbers are only revealed once the claim is approved.
    const data =
      user.role === "STUDENT"
        ? claims.map((claim) =>
            claim.status === "APPROVED"
              ? claim
              : { ...claim, item: { ...claim.item, locker: null } },
          )
        : claims;

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
    let evidenceImageUrl: string | null = null;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      itemId = form.get("itemId") as string | null;
      claimReason = form.get("claimReason") as string | null;
      const file = form.get("evidence") as File | null;
      if (file) {
        if (!file.type.startsWith("image/")) {
          return NextResponse.json({ success: false, error: "Evidence must be an image" }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ success: false, error: "Image must be under 5MB" }, { status: 400 });
        }
        // For demo: store as data URL (in production, upload to S3/R2)
        const buf = Buffer.from(await file.arrayBuffer());
        evidenceImageUrl = `data:${file.type};base64,${buf.toString("base64")}`;
      }
    } else {
      const body = await request.json();
      itemId = body.itemId;
      claimReason = body.claimReason;
      evidenceImageUrl = body.evidenceImageUrl || null;
    }

    if (!itemId) return NextResponse.json({ success: false, error: "itemId required" }, { status: 400 });
    if (!claimReason?.trim()) return NextResponse.json({ success: false, error: "claimReason required" }, { status: 400 });
    if (!evidenceImageUrl) return NextResponse.json({ success: false, error: "Photo evidence is required" }, { status: 400 });

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

    const claim = await prisma.claim.create({
      data: {
        itemId,
        userId: user.id,
        claimReason: claimReason.trim(),
        evidenceImageUrl,
      },
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
    console.error("Claim creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to create claim" }, { status: 500 });
  }
}
