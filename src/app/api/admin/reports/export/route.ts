import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

type ExportType = "items" | "claims" | "lockers" | "accounts" | "reports" | "audit";

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString().replace("T", " ").slice(0, 19) : "";
}

function maskBarcode(value: string | null) {
  if (!value) return "";
  return `****${value.slice(-4)}`;
}

// GET /api/admin/reports/export?type=items&from=&to= — CSV download.
export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const type = (params.get("type") || "items") as ExportType;
  if (!["items", "claims", "lockers", "accounts", "reports", "audit"].includes(type)) {
    return NextResponse.json({ success: false, error: "Unknown export type" }, { status: 400 });
  }

  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"), true);
  const dateFilter = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const dated = dateFilter ? { createdAt: dateFilter } : {};

  try {
    let headers: string[] = [];
    let rows: unknown[][] = [];

    if (type === "items") {
      const items = await prisma.item.findMany({
        where: dated,
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true, itemName: true, category: true, status: true, foundLocation: true,
          foundDate: true, createdAt: true, locker: { select: { lockerNumber: true } },
        },
      });
      headers = ["ID", "Item", "Category", "Status", "Found location", "Found date", "Locker", "Created"];
      rows = items.map((item) => [
        item.id, item.itemName, item.category, item.status, item.foundLocation,
        iso(item.foundDate), item.locker?.lockerNumber, iso(item.createdAt),
      ]);
    } else if (type === "claims") {
      const claims = await prisma.claim.findMany({
        where: dated,
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true, status: true, source: true, createdAt: true, approvedAt: true,
          item: { select: { itemName: true, locker: { select: { lockerNumber: true } } } },
          user: { select: { name: true, email: true } },
        },
      });
      headers = ["ID", "Item", "Student", "Email", "Status", "Source", "Locker", "Submitted", "Approved"];
      rows = claims.map((claim) => [
        claim.id, claim.item?.itemName, claim.user?.name, claim.user?.email, claim.status,
        claim.source, claim.item?.locker?.lockerNumber, iso(claim.createdAt), iso(claim.approvedAt),
      ]);
    } else if (type === "lockers") {
      const lockers = await prisma.locker.findMany({
        orderBy: { lockerNumber: "asc" },
        select: { lockerNumber: true, status: true, item: { select: { itemName: true, status: true } } },
      });
      headers = ["Locker", "Status", "Item", "Item status"];
      rows = lockers.map((locker) => [locker.lockerNumber, locker.status, locker.item?.itemName, locker.item?.status]);
    } else if (type === "accounts") {
      const accounts = await prisma.user.findMany({
        where: dated,
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          name: true, email: true, role: true, isActive: true, studentId: true,
          cardBarcode: true, createdAt: true, _count: { select: { claims: true } },
        },
      });
      headers = ["Name", "Email", "Role", "Active", "Student ID", "Barcode", "Claims", "Created"];
      rows = accounts.map((account) => [
        account.name, account.email, account.role, account.isActive ? "Yes" : "No",
        account.studentId, maskBarcode(account.cardBarcode), account._count.claims, iso(account.createdAt),
      ]);
    } else if (type === "reports") {
      const reports = await prisma.report.findMany({
        where: dated,
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true, type: true, itemName: true, category: true, status: true,
          createdAt: true, reviewedAt: true, reviewedBy: { select: { name: true } },
        },
      });
      headers = ["ID", "Type", "Item", "Category", "Status", "Submitted", "Reviewed", "Reviewer"];
      rows = reports.map((report) => [
        report.id, report.type, report.itemName, report.category, report.status,
        iso(report.createdAt), iso(report.reviewedAt), report.reviewedBy?.name,
      ]);
    } else {
      const logs = await prisma.auditLog.findMany({
        where: dated,
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      headers = ["Timestamp", "Actor", "Action", "Entity", "Entity ID", "Summary"];
      rows = logs.map((log) => [
        iso(log.createdAt), log.actorName, log.action, log.entityType, log.entityId, log.summary,
      ]);
    }

    const csv = `\uFEFF${toCsv(headers, rows)}`;
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vaultq-${type}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Report export failed", error);
    return NextResponse.json({ success: false, error: "Failed to export the report" }, { status: 500 });
  }
}
