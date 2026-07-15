/**
 * COBRA — mirror of the DbLogEntry type from apps/api/src/testing/cobra-db-tap.ts.
 *
 * We keep a local copy rather than importing across the workspace so the
 * Playwright test package doesn't need a path alias into apps/api/src. The
 * two definitions must stay in sync — small enough surface to maintain by
 * hand.
 */

export type DbLogEntry = {
  kind: "prisma";
  model: string | null;
  operation: string;
  ts: number;
};
