import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

const QR_VALIDITY_MS = 24 * 60 * 60 * 1000;

export class PickupError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409 | 410) {
    super(message);
    this.name = "PickupError";
  }
}

const CLAIM_SELECT = {
  id: true, userId: true, itemId: true, status: true,
  user: { select: { isActive: true } },
  item: {
    select: {
      id: true, itemName: true, status: true, lockerId: true,
      locker: { select: { lockerNumber: true, status: true } },
    },
  },
} satisfies Prisma.ClaimSelect;

async function lockPickup(tx: Prisma.TransactionClient, itemId: string, claimId: string) {
  // Follow the item-first lock order used by claim approval. Generation and
  // both pickup endpoints use these same locks, including on serverless hosts.
  const items = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "items" WHERE id = ${itemId} FOR UPDATE`;
  if (!items.length) throw new PickupError("Item is no longer available", 409);
  const claims = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "claims" WHERE id = ${claimId} FOR UPDATE`;
  if (!claims.length) throw new PickupError("Claim is no longer available", 409);
}

function requireCollectable(status: string) {
  if (status === "RETRIEVED") throw new PickupError("Item already collected", 409);
  if (status !== "CLAIMED") throw new PickupError("Item is not ready for collection", 409);
}

/** Return an unused QR or rotate an expired one. Never revive a consumed QR. */
export async function generatePickupQr(claimId: string, actor: { id: string; role: string }) {
  if (actor.role !== "STUDENT" && actor.role !== "ADMIN") throw new PickupError("Forbidden", 403);
  return prisma.$transaction(async (tx) => {
    const reference = await tx.claim.findUnique({ where: { id: claimId }, select: { itemId: true, userId: true } });
    if (!reference) throw new PickupError("Claim not found", 404);
    if (actor.role !== "ADMIN" && reference.userId !== actor.id) throw new PickupError("Not your claim", 403);
    await lockPickup(tx, reference.itemId, claimId);

    // Re-read after waiting for locks: another scan may have collected the item.
    const claim = await tx.claim.findUnique({ where: { id: claimId }, select: CLAIM_SELECT });
    if (!claim) throw new PickupError("Claim not found", 404);
    if (actor.role !== "ADMIN" && claim.userId !== actor.id) throw new PickupError("Not your claim", 403);
    if (claim.status !== "APPROVED") throw new PickupError("Claim must be approved first", 409);
    requireCollectable(claim.item.status);
    if (!claim.user.isActive) throw new PickupError("Student account is disabled. Contact staff.", 403);

    const existing = await tx.qrCode.findUnique({ where: { claimId } });
    if (existing?.isUsed) throw new PickupError("QR already used. Contact staff if collection was not completed.", 410);
    const now = new Date();
    if (existing && existing.expiresAt.getTime() > now.getTime()) return existing;

    const qrToken = randomUUID();
    const expiresAt = new Date(now.getTime() + QR_VALIDITY_MS);
    if (!existing) return tx.qrCode.create({ data: { claimId, qrToken, expiresAt } });

    const rotated = await tx.qrCode.updateMany({
      where: { id: existing.id, qrToken: existing.qrToken, isUsed: false, expiresAt: { lte: now } },
      data: { qrToken, expiresAt },
    });
    if (rotated.count !== 1) throw new PickupError("QR changed. Please refresh and try again.", 409);
    return tx.qrCode.findUniqueOrThrow({ where: { claimId } });
  });
}

interface PickupOptions {
  token: string;
  expectedUserId?: string;
  expectedLockerNumber?: string;
  dryRun?: boolean;
}

/** The caller must authenticate staff or a hardware device/session first. */
export async function collectPickup({ token, expectedUserId, expectedLockerNumber, dryRun = false }: PickupOptions) {
  return prisma.$transaction(async (tx) => {
    const reference = await tx.qrCode.findUnique({
      where: { qrToken: token }, select: { claimId: true, claim: { select: { itemId: true } } },
    });
    if (!reference) throw new PickupError("Invalid QR token", 404);
    await lockPickup(tx, reference.claim.itemId, reference.claimId);

    // Token rotation, QR use, claim state and locker allocation are checked
    // again inside the transaction, never trusted from a pre-lock snapshot.
    const qr = await tx.qrCode.findUnique({ where: { qrToken: token }, include: { claim: { select: CLAIM_SELECT } } });
    if (!qr) throw new PickupError("QR has expired or been replaced. Please refresh your QR.", 410);
    if (qr.isUsed) throw new PickupError("QR already used", 410);
    if (qr.expiresAt.getTime() <= Date.now()) throw new PickupError("QR expired", 410);
    const { claim } = qr;
    if (claim.status !== "APPROVED") throw new PickupError("Claim is not approved", 409);
    requireCollectable(claim.item.status);
    if (expectedUserId && claim.userId !== expectedUserId) throw new PickupError("This QR belongs to another student", 403);
    if (!claim.user.isActive) throw new PickupError("Student account is disabled. Contact staff.", 403);

    const locker = claim.item.locker?.lockerNumber || null;
    if (expectedLockerNumber && locker !== expectedLockerNumber) {
      throw new PickupError(`QR belongs to locker ${locker || "unassigned"}, not ${expectedLockerNumber}`, 409);
    }
    if (claim.item.lockerId && claim.item.locker?.status !== "OCCUPIED") {
      throw new PickupError("Locker is not ready for collection. Contact staff.", 409);
    }
    const result = { claimId: qr.claimId, locker, itemName: claim.item.itemName };
    if (dryRun) return result;

    const consumed = await tx.qrCode.updateMany({
      where: { id: qr.id, qrToken: token, isUsed: false, expiresAt: { gt: new Date() } },
      data: { isUsed: true },
    });
    if (consumed.count !== 1) throw new PickupError("QR expired or was already used", 410);
    const collected = await tx.item.updateMany({
      where: { id: claim.itemId, status: "CLAIMED", lockerId: claim.item.lockerId },
      data: { status: "RETRIEVED", lockerId: null },
    });
    if (collected.count !== 1) throw new PickupError("Item is no longer ready for collection", 409);
    if (claim.item.lockerId) {
      const released = await tx.locker.updateMany({
        where: { id: claim.item.lockerId, status: "OCCUPIED" }, data: { status: "AVAILABLE" },
      });
      if (released.count !== 1) throw new PickupError("Locker changed. Contact staff before retrying.", 409);
    }
    return result;
  });
}
