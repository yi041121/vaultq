import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { signedImageUrl } from "@/lib/image-url";
import { suggestMatches, suggestionLabel } from "@/lib/report-match";
import { toDateOnly } from "@/lib/item-mapper";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/reports/:id/suggestions — possible found items for a lost report.
 *
 * The report owner gets a short, explainable list of available inventory items
 * scored by the same matcher the admin verification queue uses. Items the
 * student handed in or already claimed are excluded so every suggestion is
 * actionable.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STUDENT") {
    return NextResponse.json({ success: false, error: "Student only" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const report = await prisma.report.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        itemId: true,
        itemName: true,
        category: true,
        description: true,
        location: true,
        date: true,
      },
    });
    if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    if (report.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your report" }, { status: 403 });
    }
    if (report.type !== "LOST" || report.status !== "PENDING" || report.itemId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const [items, ownFoundReports, existingClaims] = await Promise.all([
      prisma.item.findMany({
        where: { status: "FOUND" },
        select: {
          id: true,
          itemName: true,
          category: true,
          description: true,
          foundLocation: true,
          foundDate: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.report.findMany({
        where: {
          userId: user.id,
          type: "FOUND",
          itemId: { not: null },
        },
        select: { itemId: true },
      }),
      prisma.claim.findMany({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "APPROVED"] },
        },
        select: { itemId: true },
      }),
    ]);

    const excludedItemIds = new Set<string>([
      ...ownFoundReports.map((entry) => entry.itemId).filter((value): value is string => !!value),
      ...existingClaims.map((entry) => entry.itemId),
    ]);
    if (report.itemId) excludedItemIds.add(report.itemId);

    const candidates = items
      .filter((item) => !excludedItemIds.has(item.id))
      .map((item) => ({
        id: item.id,
        itemName: item.itemName,
        category: item.category,
        description: item.description,
        foundLocation: item.foundLocation,
        foundDate: toDateOnly(item.foundDate),
      }));

    const suggestions = suggestMatches(
      {
        itemName: report.itemName,
        category: report.category,
        description: report.description,
        location: report.location,
        date: toDateOnly(report.date),
      },
      candidates,
      { limit: 5 },
    );

    const itemById = new Map(items.map((item) => [item.id, item]));
    // Score all available metadata, not just the newest 200 items. Load image
    // bytes only for the five winners rather than for the whole inventory.
    const photos = suggestions.length ? await prisma.item.findMany({
      where: { id: { in: suggestions.map((suggestion) => suggestion.itemId) }, status: "FOUND" },
      select: { id: true, imageUrl: true },
    }) : [];
    const photoById = new Map(photos.map((item) => [item.id, item.imageUrl]));
    const data = suggestions
      .map((suggestion) => {
        const item = itemById.get(suggestion.itemId);
        if (!item || !photoById.has(item.id)) return null;
        const imageUrl = photoById.get(item.id);
        return {
          id: item.id,
          itemName: item.itemName,
          category: item.category,
          description: item.description,
          foundLocation: item.foundLocation,
          foundDate: toDateOnly(item.foundDate),
          imageUrl: imageUrl ? signedImageUrl("item", item.id, 0, imageUrl) : null,
          score: suggestion.score,
          label: suggestionLabel(suggestion.score),
          reasons: suggestion.reasons.slice(0, 3),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry);

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("Report suggestions failed", e);
    return NextResponse.json({ success: false, error: "Failed to load suggestions" }, { status: 500 });
  }
}
