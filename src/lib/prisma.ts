import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Serverless instances should hold only a few connections. Short idle and
  // connect timeouts prevent a socket that Neon closed during autosuspend from
  // hanging the first request after a quiet period.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    application_name: "vaultq",
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  }, {
    onPoolError: (error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Database pool error:", error.message);
      }
    },
    onConnectionError: (error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Database connection error:", error.message);
      }
    },
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
