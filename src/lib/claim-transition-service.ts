import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { ACTIVE_CLAIM_STATUSES } from "./claim-report-link";

export class ClaimTransitionError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409) {
    super(message);
    this.name = "ClaimTransitionError";
  }
}

const TRANSITION_SELECT = {
  id: true, itemId: true, userId: true, status: true, matchedReportId: true,
  claimReason: true, evidenceImageUrl: true, evidenceImageUrls: true,
  adminNote: true, approvedAt: true, createdAt: true, source: true,
  item: { select: { id: true, itemName: true, status: true } },
} satisfies Prisma.ClaimSelect;

async function lockClaim(tx: Prisma.TransactionClient, id: string, ownerId?: string) {
  const reference = await tx.claim.findUnique({ where: { id }, select: { itemId: true, userId: true } });
  if (!reference) throw new ClaimTransitionError("Claim not found", 404);
  if (ownerId && reference.userId !== ownerId) throw new ClaimTransitionError("Not your claim", 403);
  // Same lock order as pickup and approval: item, then claim. Re-read state
  // after locking so an approval cannot be undone using an old Pending read.
  const items = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "items" WHERE id = ${reference.itemId} FOR UPDATE`;
  if (!items.length) throw new ClaimTransitionError("Item is no longer available", 409);
  const claims = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "claims" WHERE id = ${id} FOR UPDATE`;
  if (!claims.length) throw new ClaimTransitionError("Claim is no longer available", 409);
  const claim = await tx.claim.findUnique({ where: { id }, select: TRANSITION_SELECT });
  if (!claim) throw new ClaimTransitionError("Claim not found", 404);
  if (ownerId && claim.userId !== ownerId) throw new ClaimTransitionError("Not your claim", 403);
  return claim;
}

type LinkedClaim = { id: string; userId: string; itemId: string; matchedReportId: string | null };

async function releaseReport(tx: Prisma.TransactionClient, claim: LinkedClaim) {
  if (!claim.matchedReportId) return;
  const otherActive = await tx.claim.findFirst({
    where: { matchedReportId: claim.matchedReportId, status: { in: [...ACTIVE_CLAIM_STATUSES] }, NOT: { id: claim.id } },
    select: { id: true },
  });
  if (otherActive) return;
  // A stale historical pointer is not permission to reopen closed reports or
  // detach a report that was reassigned to a different item/student.
  await tx.report.updateMany({
    where: { id: claim.matchedReportId, userId: claim.userId, type: "LOST", status: "MATCHED", itemId: claim.itemId },
    data: { status: "PENDING", itemId: null, reviewedAt: null, reviewedById: null, adminNote: null },
  });
}

/** Caller must authenticate an administrator before rejecting a claim. */
export async function rejectPendingClaim(id: string, adminNote: string | null) {
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, id);
    if (claim.status !== "PENDING") throw new ClaimTransitionError(`Claim already ${claim.status.toLowerCase()}`, 409);
    const changed = await tx.claim.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", adminNote, approvedAt: new Date() },
    });
    if (changed.count !== 1) throw new ClaimTransitionError("Claim changed. Please refresh and try again.", 409);
    await releaseReport(tx, claim);
    return tx.claim.findUniqueOrThrow({ where: { id }, select: TRANSITION_SELECT });
  });
}

export async function cancelPendingClaim(id: string, ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, id, ownerId);
    if (claim.status !== "PENDING") throw new ClaimTransitionError(`Claim already ${claim.status.toLowerCase()}`, 409);
    const removed = await tx.claim.deleteMany({ where: { id, userId: ownerId, status: "PENDING" } });
    if (removed.count !== 1) throw new ClaimTransitionError("Claim changed. Please refresh and try again.", 409);
    await releaseReport(tx, claim);
    return { id };
  });
}

export async function resubmitRejectedClaim(id: string, ownerId: string, input: { claimReason: string; evidenceImageUrls: string[] }) {
  if (!input.claimReason.trim() || !input.evidenceImageUrls.length) throw new ClaimTransitionError("Claim explanation and photo evidence are required", 400);
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, id, ownerId);
    if (claim.status !== "REJECTED") throw new ClaimTransitionError("Only rejected claims can be resubmitted", 409);
    if (claim.item.status !== "FOUND") throw new ClaimTransitionError("This item is no longer available for claim", 409);
    const existing = await tx.claim.findFirst({
      where: { itemId: claim.itemId, status: { in: [...ACTIVE_CLAIM_STATUSES] }, NOT: { id }, OR: [{ userId: ownerId }, { status: "APPROVED" }] },
      select: { id: true },
    });
    if (existing) throw new ClaimTransitionError("You already have an active claim, or this item has been approved for someone else", 409);
    const ownFoundReport = await tx.report.findFirst({
      where: { itemId: claim.itemId, userId: ownerId, type: "FOUND", status: "VERIFIED" }, select: { id: true },
    });
    if (ownFoundReport) throw new ClaimTransitionError("You cannot claim an item you reported as found", 403);

    if (claim.matchedReportId) {
      const activeLink = await tx.claim.findFirst({
        where: { matchedReportId: claim.matchedReportId, status: { in: [...ACTIVE_CLAIM_STATUSES] }, NOT: { id } },
        select: { id: true },
      });
      if (activeLink) throw new ClaimTransitionError("Your lost report is linked to another active claim. Review that claim first.", 409);
      const linked = await tx.report.updateMany({
        where: { id: claim.matchedReportId, userId: ownerId, type: "LOST", status: "PENDING", itemId: null },
        data: { status: "MATCHED", itemId: claim.itemId, reviewedAt: null, reviewedById: null, adminNote: null },
      });
      if (linked.count !== 1) throw new ClaimTransitionError("Your lost report is no longer pending. Refresh and review it before resubmitting.", 409);
    }
    const changed = await tx.claim.updateMany({
      where: { id, userId: ownerId, status: "REJECTED" },
      data: {
        claimReason: input.claimReason.trim(), evidenceImageUrl: input.evidenceImageUrls[0], evidenceImageUrls: input.evidenceImageUrls,
        status: "PENDING", approvedAt: null, adminNote: null,
      },
    });
    if (changed.count !== 1) throw new ClaimTransitionError("Claim changed. Please refresh and try again.", 409);
    return tx.claim.findUniqueOrThrow({ where: { id }, select: TRANSITION_SELECT });
  });
}
