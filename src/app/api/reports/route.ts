import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isItemCategory } from "@/lib/categories";
import { notifyUser } from "@/lib/notification-service";
import { REPORT_INCLUDE } from "@/lib/report-include";
import { VALID_REPORT_TYPES, validateReportDetails } from "@/lib/report-validation";
import { signedImageUrl } from "@/lib/image-url";

const VALID_STATUS = ["PENDING", "MATCHED", "VERIFIED", "REJECTED", "CLOSED"] as const;

// GET /api/reports?type=&status=&q=&category= — own reports, or all for admin
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";
    const q = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category") || "";

    const where: any = user.role === "ADMIN" ? {} : { userId: user.id };
    if ((VALID_REPORT_TYPES as readonly string[]).includes(type)) where.type = type;
    if ((VALID_STATUS as readonly string[]).includes(status)) where.status = status;
    if (category && isItemCategory(category)) where.category = category;
    if (q) {
      where.OR = [
        { itemName: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const reports = await prisma.report.findMany({
      where,
      include: REPORT_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Students do not get storage locations from report cards. Pickup details
    // are delivered through the approved claim instead.
    let data: any[] =
      user.role === "STUDENT"
        ? reports.map((report) => ({
            ...report,
            item: report.item ? { ...report.item, locker: null } : null,
          }))
        : reports;

    // Lightweight lists (admin verification queue) send signed image URLs
    // instead of embedding base64 image data in the JSON response.
    if (searchParams.get("light") === "1") {
      data = data.map((report: any) => {
        const sources: string[] = Array.isArray(report.imageUrls) && report.imageUrls.length
          ? report.imageUrls
          : report.imageUrl
            ? [report.imageUrl]
            : [];
        const urls = sources
          .map((source, index) => signedImageUrl("report", report.id, index, source))
          .filter(Boolean);
        return {
          ...report,
          imageUrl: urls[0] || null,
          imageUrls: urls,
          item: report.item
            ? {
                ...report.item,
                imageUrl: report.item.imageUrl
                  ? signedImageUrl("item", report.item.id, 0, report.item.imageUrl)
                  : null,
              }
            : null,
        };
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("Reports list failed", e);
    return NextResponse.json({ success: false, error: "Failed to list reports" }, { status: 500 });
  }
}

// POST /api/reports — student submits a lost or found report
export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STUDENT") {
    return NextResponse.json({ success: false, error: "Only students can submit reports" }, { status: 403 });
  }

  try {
    let type: string | null = null;
    let itemName: string | null = null;
    let category: string | null = null;
    let description: string | null = null;
    let location: string | null = null;
    let date: string | null = null;
    let imageUrls: string[] = [];

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      type = form.get("type") as string | null;
      itemName = form.get("itemName") as string | null;
      category = form.get("category") as string | null;
      description = form.get("description") as string | null;
      location = form.get("location") as string | null;
      date = form.get("date") as string | null;

      const files = [...form.getAll("photos"), ...form.getAll("photo")].filter(
        (entry): entry is File => entry instanceof File && entry.size > 0,
      );
      if (files.length > 3) {
        return NextResponse.json({ success: false, error: "You can upload up to 3 photos" }, { status: 400 });
      }
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          return NextResponse.json({ success: false, error: "Photos must be images" }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ success: false, error: "Each image must be under 5MB" }, { status: 400 });
        }
        const buf = Buffer.from(await file.arrayBuffer());
        imageUrls.push(`data:${file.type};base64,${buf.toString("base64")}`);
      }
    } else {
      const body = await request.json();
      type = body.type ?? null;
      itemName = body.itemName ?? null;
      category = body.category ?? null;
      description = body.description ?? null;
      location = body.location ?? null;
      date = body.date ?? null;
      imageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : body.imageUrl
          ? [body.imageUrl]
          : [];
      if (imageUrls.length > 3) {
        return NextResponse.json({ success: false, error: "You can upload up to 3 photos" }, { status: 400 });
      }
    }

    if (!type || !(VALID_REPORT_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ success: false, error: "type must be LOST or FOUND" }, { status: 400 });
    }

    const parsed = validateReportDetails({ itemName, category, description, location, date });
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { itemName: cleanName, category: cleanCategory, description: cleanDescription, location: cleanLocation, date: cleanDate } = parsed.value;

    const duplicate = await prisma.report.findFirst({
      where: {
        userId: user.id,
        type: type as any,
        itemName: { equals: cleanName, mode: "insensitive" },
        status: "PENDING",
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ success: false, error: "You already have a pending report for this item" }, { status: 409 });
    }

    const report = await prisma.report.create({
      data: {
        userId: user.id,
        type: type as any,
        itemName: cleanName,
        category: cleanCategory,
        description: cleanDescription,
        location: cleanLocation,
        date: cleanDate,
        imageUrl: imageUrls[0] || null,
        imageUrls,
      },
    });

    await notifyUser(
      user.id,
      "Report Received",
      type === "LOST"
        ? `Your lost item report for ${cleanName} has been received. We will notify you if a matching item is found.`
        : `Your found item report for ${cleanName} has been received. Please hand the item to the Lost & Found office so it can be verified.`,
      { type: "REPORT", link: `/dashboard/student/report?tab=reports&kind=${type}` },
    );

    return NextResponse.json({ success: true, data: report }, { status: 201 });
  } catch (e) {
    console.error("Report creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to submit report" }, { status: 500 });
  }
}
