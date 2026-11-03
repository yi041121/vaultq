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

/**
 * Creates a found item and, when provided, occupies its locker. Callers are
 * responsible for validating that the locker is available.
 */
export async function createItemRecord(db: ItemDb, adminId: string, input: CreateItemInput) {
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

  if (input.lockerId) {
    await db.locker.update({ where: { id: input.lockerId }, data: { status: "OCCUPIED" } });
  }

  return created;
}
