import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { normalizeImageSources } from "./image-validation";
import { REPORT_INCLUDE } from "./report-include";
import type { ReportStatus } from "@/generated/prisma/enums";

export class ClaimReviewError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409) {
    super(message);
    this.name = "ClaimReviewError";
  }
}

/** Expected uniqueness/locking conflicts must not appear as successful reviews. */
export function isReviewWriteConflict(error: unknown): boolean {
  const details = error as { code?: string; meta?: { code?: string } } | null;
  return details?.code === "P2002" || details?.code === "P2034"
    || (details?.code === "P2010" && ["40001", "40P01", "55P03"].includes(details.meta?.code || ""));
}

const ITEM_SELECT = {
  id: true, itemName: true, status: true, lockerId: true,
  locker: { select: { id: true, lockerNumber: true, status: true } },
} satisfies Prisma.ItemSelect;

async function lockItem(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "items" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new ClaimReviewError("Item not found", 404);
  const item = await tx.item.findUnique({ where: { id }, select: ITEM_SELECT });
  if (!item || item.status !== "FOUND") throw new ClaimReviewError("Item is no longer available", 409);
  return item;
}

async function lockReport(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "reports" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new ClaimReviewError("Lost report is no longer available", 409);
}

async function requireEligibleStudent(tx: Prisma.TransactionClient, userId: string, itemId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } });
  if (!user?.isActive || user.role !== "STUDENT") throw new ClaimReviewError("Student account is not active", 409);
  const ownFound = await tx.report.findFirst({ where: { userId, itemId, type: "FOUND", status: "VERIFIED" }, select: { id: true } });
  if (ownFound) throw new ClaimReviewError("A student cannot claim an item they reported as found", 409);
}

type ReviewItem = Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }>;

async function allocateLocker(tx: Prisma.TransactionClient, item: ReviewItem, options: { lockerNumber?: string | null; auto?: boolean }) {
  let targetId = item.lockerId;
  if (options.lockerNumber) {
    const target = await tx.locker.findUnique({ where: { lockerNumber: options.lockerNumber }, select: { id: true } });
    if (!target) throw new ClaimReviewError("Locker not found", 404);
    targetId = target.id;
  } else if (!targetId && options.auto) {
    // Competing matches take different free lockers, not a stale shared first
    // result. Keep existing office-pickup behavior if no locker is available.
    const available = await tx.$queryRaw<{ id: string }[]>`
      SELECT l.id FROM "lockers" l
      WHERE l.status = 'AVAILABLE'
        AND NOT EXISTS (SELECT 1 FROM "items" i WHERE i.locker_id = l.id)
      ORDER BY l.locker_number LIMIT 1 FOR UPDATE SKIP LOCKED
    `;
    targetId = available[0]?.id || null;
  }
  // Consistent ordering also protects explicit moves between two lockers.
  for (const id of [...new Set([item.lockerId, targetId].filter((id): id is string => !!id))].sort()) {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "lockers" WHERE id = ${id} FOR UPDATE`;
    if (!locked.length) throw new ClaimReviewError("Locker changed. Please refresh.", 409);
  }
  if (!targetId) return { id: null, number: null };
  const target = await tx.locker.findUnique({
    where: { id: targetId }, select: { id: true, lockerNumber: true, status: true, item: { select: { id: true } } },
  });
  if (!target) throw new ClaimReviewError("Locker not found", 404);
  if (targetId === item.lockerId) {
    if (target.status !== "OCCUPIED" || target.item?.id !== item.id) throw new ClaimReviewError("Assigned locker is not ready. Please review the allocation.", 409);
  } else {
    if (target.status !== "AVAILABLE" || target.item) throw new ClaimReviewError("Locker is no longer available", 409);
    const taken = await tx.locker.updateMany({ where: { id: targetId, status: "AVAILABLE", item: { is: null } }, data: { status: "OCCUPIED" } });
    if (taken.count !== 1) throw new ClaimReviewError("Locker is no longer available", 409);
  }
  return { id: targetId, number: target.lockerNumber };
}

async function winItem(tx: Prisma.TransactionClient, item: ReviewItem, lockerId: string | null) {
  const won = await tx.item.updateMany({
    where: { id: item.id, status: "FOUND", lockerId: item.lockerId }, data: { status: "CLAIMED", lockerId },
  });
  if (won.count !== 1) throw new ClaimReviewError("Item changed or was approved for another student", 409);
  if (item.lockerId && item.lockerId !== lockerId) {
    // Never accidentally change a maintenance locker to AVAILABLE.
    await tx.locker.updateMany({ where: { id: item.lockerId, status: "OCCUPIED", item: { is: null } }, data: { status: "AVAILABLE" } });
  }
}

async function closeRivals(tx: Prisma.TransactionClient, itemId: string, winnerId: string, adminId: string, excludedReportId?: string) {
  const otherPending = await tx.claim.findMany({
    where: { itemId, status: "PENDING", NOT: { id: winnerId } }, select: { id: true, userId: true },
  });
  const matchedReports = await tx.report.findMany({
    where: { itemId, type: "LOST", status: "MATCHED", ...(excludedReportId ? { NOT: { id: excludedReportId } } : {}) },
    select: { id: true, userId: true }, orderBy: { id: "asc" },
  });
  if (otherPending.length) await tx.claim.updateMany({
    where: { itemId, status: "PENDING", NOT: { id: winnerId } },
    data: { status: "REJECTED", adminNote: "Item has been approved for another student", approvedAt: new Date() },
  });
  // Preserve the existing policy: approval closes reports matched to this item.
  if (matchedReports.length) await tx.report.updateMany({
    where: { id: { in: matchedReports.map(report => report.id) }, itemId, type: "LOST", status: "MATCHED" },
    data: { status: "CLOSED", reviewedAt: new Date(), reviewedById: adminId },
  });
  return { otherPending, matchedReports };
}

/** Route must authenticate an administrator before calling this service. */
export async function approvePendingClaim(id: string, adminId: string, options: { lockerNumber?: string | null; adminNote?: string | null }) {
  return prisma.$transaction(async tx => {
    const reference = await tx.claim.findUnique({ where: { id }, select: { itemId: true } });
    if (!reference) throw new ClaimReviewError("Claim not found", 404);
    const item = await lockItem(tx, reference.itemId);
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "claims" WHERE id = ${id} FOR UPDATE`;
    if (!locked.length) throw new ClaimReviewError("Claim was cancelled. Please refresh.", 409);
    const claim = await tx.claim.findUnique({ where: { id }, select: { id: true, status: true, userId: true, matchedReportId: true } });
    if (!claim || claim.status !== "PENDING") throw new ClaimReviewError("Claim was already reviewed or cancelled. Please refresh.", 409);
    await requireEligibleStudent(tx, claim.userId, item.id);
    const approved = await tx.claim.findFirst({ where: { itemId: item.id, status: "APPROVED" }, select: { id: true } });
    if (approved) throw new ClaimReviewError("Item already has an approved claim", 409);
    if (claim.matchedReportId) {
      await lockReport(tx, claim.matchedReportId);
      const report = await tx.report.findFirst({ where: { id: claim.matchedReportId, userId: claim.userId, type: "LOST", status: "MATCHED", itemId: item.id }, select: { id: true } });
      if (!report) throw new ClaimReviewError("Linked lost report changed. Please review it before approval.", 409);
      const otherLink = await tx.claim.findFirst({ where: { matchedReportId: claim.matchedReportId, status: { in: ["PENDING", "APPROVED"] }, NOT: { id } }, select: { id: true } });
      if (otherLink) throw new ClaimReviewError("Lost report is linked to another active claim", 409);
    }
    const locker = await allocateLocker(tx, item, options);
    await winItem(tx, item, locker.id);
    const changed = await tx.claim.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", approvedAt: new Date(), adminNote: options.adminNote || null } });
    if (changed.count !== 1) throw new ClaimReviewError("Claim changed. Please refresh.", 409);
    const rivals = await closeRivals(tx, item.id, id, adminId);
    const updated = await tx.claim.findUniqueOrThrow({ where: { id } });
    return { updated, ...rivals, itemName: item.itemName, userId: claim.userId, locker: locker.number };
  });
}

function reportRevision(report: { itemName: string; userId: string; description: string; category: string | null; location: string | null; date: Date | null; imageUrl: string | null; imageUrls: string[] }) {
  return createHash("sha256").update(JSON.stringify([report.userId, report.itemName, report.description, report.category, report.location, report.date, report.imageUrl, report.imageUrls])).digest("hex");
}

/** Admin matching intentionally remains immediate approval, not a suggestion. */
export async function matchLostReport(reportId: string, itemId: string, adminId: string) {
  const snapshot = await prisma.report.findUnique({ where: { id: reportId } });
  if (!snapshot) throw new ClaimReviewError("Report not found", 404);
  if (snapshot.type !== "LOST") throw new ClaimReviewError("Only lost reports can be matched", 400);
  if (snapshot.status !== "PENDING") throw new ClaimReviewError("Lost report is no longer pending", 409);
  // Decode outside the transaction, then require the same revision under lock.
  const revision = reportRevision(snapshot);
  const photos = await normalizeImageSources(snapshot.imageUrls.length ? snapshot.imageUrls.slice(0, 3) : snapshot.imageUrl ? [snapshot.imageUrl] : []);
  return prisma.$transaction(async tx => {
    const item = await lockItem(tx, itemId);
    await lockReport(tx, reportId);
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (!report || report.type !== "LOST" || report.status !== "PENDING" || report.itemId || reportRevision(report) !== revision) {
      throw new ClaimReviewError("Lost report was changed, linked or reviewed. Please refresh before matching.", 409);
    }
    await requireEligibleStudent(tx, report.userId, itemId);
    const existing = await tx.claim.findFirst({
      where: { status: { in: ["PENDING", "APPROVED"] }, OR: [{ itemId, userId: report.userId }, { matchedReportId: reportId }, { itemId, status: "APPROVED" }] },
      select: { id: true },
    });
    if (existing) throw new ClaimReviewError("Student or lost report already has an active claim for this item. Review that claim instead.", 409);
    const locker = await allocateLocker(tx, item, { auto: true });
    await winItem(tx, item, locker.id);
    const linked = await tx.report.updateMany({
      where: { id: reportId, userId: report.userId, type: "LOST", status: "PENDING", itemId: null },
      data: { status: "CLOSED", itemId, reviewedById: adminId, reviewedAt: new Date() },
    });
    if (linked.count !== 1) throw new ClaimReviewError("Lost report was already linked or reviewed", 409);
    const created = await tx.claim.create({ data: {
      itemId, userId: report.userId, claimReason: "Matched by admin from lost report", evidenceImageUrl: photos[0] || null,
      evidenceImageUrls: photos, source: "MATCH", matchedReportId: reportId, status: "APPROVED", approvedAt: new Date(),
    } });
    const rivals = await closeRivals(tx, itemId, created.id, adminId, reportId);
    return { created, ...rivals, itemName: item.itemName, reportName: report.itemName, userId: report.userId, locker: locker.number };
  });
}

/** Legacy report notices/reviews must not overwrite reports used by claims. */
export async function reviewUnclaimedReport(id: string, expected: { status: ReportStatus; itemId: string | null }, data: Prisma.ReportUncheckedUpdateInput, targetItemId?: string) {
  return prisma.$transaction(async tx => {
    if (targetItemId) await lockItem(tx, targetItemId);
    await lockReport(tx, id);
    const report = await tx.report.findUnique({ where: { id }, select: { status: true, itemId: true } });
    if (!report || report.status !== expected.status || report.itemId !== expected.itemId) throw new ClaimReviewError("Report changed. Please refresh before reviewing.", 409);
    const active = await tx.claim.findFirst({ where: { matchedReportId: id, status: { in: ["PENDING", "APPROVED"] } }, select: { id: true } });
    if (active) throw new ClaimReviewError("This report belongs to an active claim. Review that claim instead.", 409);
    const changed = await tx.report.updateMany({ where: { id, status: expected.status, itemId: expected.itemId }, data });
    if (changed.count !== 1) throw new ClaimReviewError("Report changed. Please refresh.", 409);
    return tx.report.findUniqueOrThrow({ where: { id }, include: REPORT_INCLUDE });
  });
}
