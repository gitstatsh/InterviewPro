import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// COBRA: when TEST_MODE=1, wrap the client so every model operation is
// recorded to an in-memory buffer that /__coverage__/snapshot drains. The
// extension is invisible to callers — the returned client keeps the full
// PrismaClient surface, we just cast the brand back for shared typing.
async function withCobraTap(client: PrismaClient): Promise<PrismaClient> {
  if (env.TEST_MODE !== "1" && env.COBRA_ENABLED !== "1") return client;
  const { attachDbTap } = await import("../testing/cobra-db-tap.js");
  return attachDbTap(client) as unknown as PrismaClient;
}

export const prisma: PrismaClient = await withCobraTap(basePrisma);

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
