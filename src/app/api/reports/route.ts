import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isItemCategory } from "@/lib/categories";
import { notifyUser } from "@/lib/notification-service";
import { REPORT_INCLUDE } from "@/lib/report-include";

const VALID_TYPES = ["LOST", "FOUND"] as const;
const VALID_STATUS = ["PENDING", "MATCHED", "VERIFIED", "REJECTED", "CLOSED"] as const;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

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
    if ((VALID_TYPES as readonly string[]).includes(type)) where.type = type;
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
    const data =
      user.role === "STUDENT"
        ? reports.map((report) => ({
            ...report,
            item: report.item ? { ...report.item, locker: null } : null,
          }))
        : reports;

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
    let imageUrl: string | null = null;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      type = form.get("type") as string | null;
      itemName = form.get("itemName") as string | null;
      category = form.get("category") as string | null;
      description = form.get("description") as string | null;
      location = form.get("location") as string | null;
      date = form.get("date") as string | null;

      const file = form.get("photo") as File | null;
      if (file && file.size > 0) {
        if (!file.type.startsWith("image/")) {
          return NextResponse.json({ success: false, error: "Photo must be an image" }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ success: false, error: "Image must be under 5MB" }, { status: 400 });
        }
        const buf = Buffer.from(await file.arrayBuffer());
        imageUrl = `data:${file.type};base64,${buf.toString("base64")}`;
      }
    } else {
      const body = await request.json();
      type = body.type ?? null;
      itemName = body.itemName ?? null;
      category = body.category ?? null;
      description = body.description ?? null;
      location = body.location ?? null;
      date = body.date ?? null;
      imageUrl = body.imageUrl || null;
    }

    if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ success: false, error: "type must be LOST or FOUND" }, { status: 400 });
    }
    const cleanName = (itemName || "").trim();
    if (cleanName.length < 2 || cleanName.length > 100) {
      return NextResponse.json({ success: false, error: "Item name must be 2-100 characters" }, { status: 400 });
    }
    const cleanDescription = (description || "").trim();
    if (cleanDescription.length < 5 || cleanDescription.length > 2000) {
      return NextResponse.json({ success: false, error: "Description must be 5-2000 characters" }, { status: 400 });
    }
    const cleanLocation = (location || "").trim();
    if (cleanLocation.length < 2 || cleanLocation.length > 200) {
      return NextResponse.json({ success: false, error: "Location must be 2-200 characters" }, { status: 400 });
    }
    if (category && !isItemCategory(category)) {
      return NextResponse.json({ success: false, error: "Invalid category" }, { status: 400 });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
      return NextResponse.json({ success: false, error: "A valid date is required" }, { status: 400 });
    }
    if (date > todayIso()) {
      return NextResponse.json({ success: false, error: "Date cannot be in the future" }, { status: 400 });
    }

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
        category: category || null,
        description: cleanDescription,
        location: cleanLocation,
        date: new Date(`${date}T00:00:00.000Z`),
        imageUrl,
      },
    });

    await notifyUser(
      user.id,
      "Report Received",
      type === "LOST"
        ? `Your lost item report for ${cleanName} has been received. We will notify you if a matching item is found.`
        : `Your found item report for ${cleanName} has been received. Please hand the item to the Lost & Found office so it can be verified.`,
      { type: "REPORT", link: "/dashboard/student/report?tab=reports" },
    );

    return NextResponse.json({ success: true, data: report }, { status: 201 });
  } catch (e) {
    console.error("Report creation failed", e);
    return NextResponse.json({ success: false, error: "Failed to submit report" }, { status: 500 });
  }
}
