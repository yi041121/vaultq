import { prisma } from "./prisma";

export type ItemStatusValue = "FOUND" | "CLAIMED" | "RETRIEVED" | "EXPIRED";

export interface CreateItemInput {
  itemName: string;
  category?: string | null;
  description?: string | null;
  foundLocation: string;
  foundDate?: string | Date | null;
  imageUrl?: string | null;
  lockerId?: string | null;
  status?: ItemStatusValue;
}

type ItemDb = Pick<typeof prisma, "item" | "locker">;

export class ItemAllocationConflict extends Error {}

/**
 * Creates a found item and, when provided, occupies its locker. Callers are
 * responsible for validating that the locker is available.
 */
export async function createItemRecord(db: ItemDb, adminId: string, input: CreateItemInput) {
  if (input.lockerId) {
    const reserved = await db.locker.updateMany({
      where: { id: input.lockerId, status: "AVAILABLE", item: { is: null } },
      data: { status: "OCCUPIED" },
    });
    if (reserved.count !== 1) throw new ItemAllocationConflict("Locker is no longer available. Refresh and choose another locker.");
  }
  const created = await db.item.create({
    data: {
      itemName: input.itemName.trim(),
      category: input.category || null,
      description: input.description || null,
      foundLocation: input.foundLocation.trim(),
      foundDate: input.foundDate ? new Date(input.foundDate) : null,
      imageUrl: input.imageUrl || null,
      status: input.status || "FOUND",
      adminId,
      ...(input.lockerId ? { lockerId: input.lockerId } : {}),
    },
  });

  return created;
}
