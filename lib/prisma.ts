import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Prisma singleton — prevents multiple client instances in development due to
// Next.js hot-reload creating a new module scope on every file change.
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
