import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// GET /api/claims — list current user's claims or all for admin
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const claims = await prisma.claim.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id },
    include: { item: { select: { itemName: true, category: true, foundLocation: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: claims });
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

    // Notify admin (optional)
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Claim Submitted",
        message: `Your claim for ${item.itemName} with evidence is awaiting verification.`,
      },
    });

    return NextResponse.json({ success: true, data: claim }, { status: 201 });
  } catch (e) {
    console.error("Claim creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to create claim" }, { status: 500 });
  }
}
