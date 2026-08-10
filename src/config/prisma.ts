import { PrismaClient } from "@prisma/client";
import { isProduction } from "./env";

/**
 * WHY A SINGLETON
 * ---------------
 * Every `new PrismaClient()` opens its own pool of database connections.
 * Postgres on a free tier allows maybe 20 connections total. Create a
 * client per request and you exhaust that in seconds.
 *
 * Worse in development: `tsx watch` reloads modules on every save. Without
 * the globalThis cache below, each save leaks another pool until Postgres
 * refuses new connections and you get "too many clients already".
 *
 * So: create ONE client, reuse it everywhere.
 */

// `globalThis` survives hot reloads; normal module scope does not.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // In dev, log every SQL query Prisma generates. Genuinely the fastest
    // way to learn SQL — write a Prisma query, read what it compiles to.
    log: isProduction ? ["error"] : ["query", "warn", "error"],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}