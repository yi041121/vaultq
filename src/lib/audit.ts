import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export type AuditActor = { id: string; name: string } | null | undefined;

export interface AuditEntry {
  actor?: AuditActor;
  action: string;
  entityType: "REPORT" | "CLAIM" | "ITEM" | "LOCKER" | "ACCOUNT" | "AUTH";
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Writes one administrative/lifecycle event. Auditing must never fail the
 * action it describes, so errors are logged and swallowed: a missing history
 * row is preferable to a rejected verification or approval.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorName: entry.actor?.name ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        metadata: entry.metadata,
      },
    });
  } catch (error) {
    console.error("Audit log write failed", {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
