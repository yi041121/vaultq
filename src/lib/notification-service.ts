import { prisma } from "./prisma";
import type { NotificationType } from "@/generated/prisma/enums";

interface NotifyOptions {
  type?: NotificationType;
  link?: string | null;
}

/** Fire-and-forget notification so a messaging failure never blocks the action. */
export async function notifyUser(userId: string, title: string, message: string, options: NotifyOptions = {}) {
  await prisma.notification
    .create({
      data: {
        userId,
        title,
        message,
        type: options.type || "SYSTEM",
        link: options.link || null,
      },
    })
    .catch(() => {});
}

export async function notifyUsers(entries: Array<{ userId: string; title: string; message: string } & NotifyOptions>) {
  if (!entries.length) return;
  await prisma.notification
    .createMany({
      data: entries.map((entry) => ({
        userId: entry.userId,
        title: entry.title,
        message: entry.message,
        type: entry.type || "SYSTEM",
        link: entry.link || null,
      })),
    })
    .catch(() => {});
}
