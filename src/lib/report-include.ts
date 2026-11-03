// Shared Prisma include for report API responses.
export const REPORT_INCLUDE = {
  user: { select: { name: true, studentId: true, email: true } },
  item: {
    select: {
      id: true,
      itemName: true,
      category: true,
      status: true,
      imageUrl: true,
      locker: { select: { lockerNumber: true } },
    },
  },
  reviewedBy: { select: { name: true } },
} as const;
