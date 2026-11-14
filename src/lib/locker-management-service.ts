import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export class LockerManagementError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409) { super(message); }
}

async function lockLocker(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "lockers" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new LockerManagementError("Locker not found", 404);
  const locker = await tx.locker.findUnique({ where: { id }, include: { item: { select: { id: true } } } });
  if (!locker) throw new LockerManagementError("Locker not found", 404);
  return locker;
}

/** Manual operations use the same item-first lock order as approval/pickup. */
export async function changeLocker(id: string, input: { status?: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE"; itemId?: string; release?: boolean }) {
  return prisma.$transaction(async tx => {
    const snapshot = await tx.locker.findUnique({ where: { id }, select: { item: { select: { id: true } } } });
    if (!snapshot) throw new LockerManagementError("Locker not found", 404);
    const itemId = input.release ? snapshot.item?.id : input.itemId;
    if ((input.release || input.itemId) && !itemId) throw new LockerManagementError("Locker is already empty", 409);
    let item: { id: string; status: string; lockerId: string | null } | null = null;
    if (itemId) {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "items" WHERE id = ${itemId} FOR UPDATE`;
      if (!rows.length) throw new LockerManagementError("Item not found", 404);
      item = await tx.item.findUnique({ where: { id: itemId }, select: { id: true, status: true, lockerId: true } });
      if (!item || (item.status !== "FOUND" && !(input.release && item.status === "EXPIRED"))) throw new LockerManagementError("Only unclaimed items can be moved. Use the collection workflow for approved items.", 409);
    }
    const locker = await lockLocker(tx, id);
    if (input.release) {
      if (!item || locker.item?.id !== item.id || item.lockerId !== id) throw new LockerManagementError("Locker assignment changed. Refresh before releasing.", 409);
      await tx.item.update({ where: { id: item.id }, data: { lockerId: null } });
      return tx.locker.update({ where: { id }, data: { status: "AVAILABLE" } });
    }
    if (input.itemId) {
      if (!item || item.lockerId || locker.item || locker.status !== "AVAILABLE") throw new LockerManagementError("Item or locker is no longer available", 409);
      await tx.item.update({ where: { id: item.id }, data: { lockerId: id } });
      return tx.locker.update({ where: { id }, data: { status: "OCCUPIED" } });
    }
    if ((input.status === "AVAILABLE" || input.status === "MAINTENANCE") && locker.item) throw new LockerManagementError("Release the item before changing this locker’s status", 409);
    if (input.status === "OCCUPIED" && !locker.item) throw new LockerManagementError("Assign an item before marking the locker occupied", 409);
    return tx.locker.update({ where: { id }, data: { status: input.status } });
  });
}

export async function deleteEmptyLocker(id: string) {
  return prisma.$transaction(async tx => {
    const locker = await lockLocker(tx, id);
    if (locker.item) throw new LockerManagementError("Release the item before deleting the locker", 409);
    await tx.locker.delete({ where: { id } });
    return { id };
  });
}
