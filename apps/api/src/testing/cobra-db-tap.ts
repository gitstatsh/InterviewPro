/**
 * COBRA — Prisma "database tap".
 *
 * V8 coverage sees the JS call site (e.g. candidates.service.ts:22) but has
 * no visibility into what Prisma actually did against the external Postgres
 * engine. For impact analysis we need the logical DB access — which models
 * and operations were exercised — so the future impact analyzer can flag
 * tests whose external dependencies changed (schema migrations, RLS, etc.)
 * without having to statically re-derive them from the source.
 *
 * Implementation is a Prisma Client Extension (`$extends`) — the modern
 * replacement for `$use` middleware. We record only { model, operation };
 * argument values are deliberately NOT stored to avoid leaking PII into
 * on-disk coverage artefacts.
 */

import type { PrismaClient } from "@prisma/client";

export type DbLogEntry = {
  /** Discriminator so future taps (redis, s3, http) can share this field. */
  kind: "prisma";
  /** Prisma model name, e.g. "candidate". Null for raw queries. */
  model: string | null;
  /** Prisma operation, e.g. "findMany", "count", "$queryRaw". */
  operation: string;
  /** Millisecond timestamp; useful for ordering, not exposed as PII. */
  ts: number;
};

let buffer: DbLogEntry[] = [];

export function resetDbLog(): void {
  buffer = [];
}

export function takeDbLog(): DbLogEntry[] {
  const snapshot = buffer;
  buffer = [];
  return snapshot;
}

/**
 * Wraps a PrismaClient so every model operation is recorded before delegating.
 * The returned client has the same public API as the input — callers won't
 * notice the tap is there.
 */
export function attachDbTap<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: "cobra-db-tap",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          buffer.push({
            kind: "prisma",
            model: model ?? null,
            operation,
            ts: Date.now(),
          });
          return query(args);
        },
      },
    },
  });
}
