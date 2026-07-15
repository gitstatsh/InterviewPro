/**
 * COBRA — HTTP client for the API's test-support endpoints.
 *
 * The API base URL and shared token are read from environment variables set
 * by playwright.config.ts. Kept minimal (raw fetch) — no retries, no logging;
 * failures should surface as test infra errors, not be silently swallowed.
 */

import type { DbLogEntry } from "./cobra-types-mirror.js";

/** V8 script coverage entry enriched with executed source, mirrors CoveredScript in cobra-coverage.ts. */
export type CoveredScript = {
  scriptId: string;
  url: string;
  source: string;
  /** Parsed external source map supplied by a remotely hosted API process. */
  sourceMap?: Record<string, unknown>;
  /** Original map URL used as the base for resolving relative sources. */
  sourceMapUrl?: string;
  functions: Array<{
    functionName: string;
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
    isBlockCoverage: boolean;
  }>;
};

export type SnapshotResponse = {
  v8: CoveredScript[];
  db: DbLogEntry[];
};

const API_BASE = process.env.COBRA_API_URL ?? "http://localhost:3001";
const TOKEN = process.env.COBRA_TOKEN ?? "";

function headers(): Record<string, string> {
  if (!TOKEN) {
    throw new Error(
      "[cobra] COBRA_TOKEN is not set. Configure it in playwright.config.ts webServer env."
    );
  }
  return { "x-cobra-token": TOKEN, "content-type": "application/json" };
}

export const cobraClient = {
  async reset(): Promise<void> {
    const res = await fetch(`${API_BASE}/__coverage__/reset`, {
      method: "POST",
      headers: headers(),
    });
    if (!res.ok) {
      throw new Error(
        `[cobra] reset failed: ${res.status} — is the API running with TEST_MODE=1?`
      );
    }
  },

  async snapshot(): Promise<SnapshotResponse> {
    const res = await fetch(`${API_BASE}/__coverage__/snapshot`, {
      method: "GET",
      headers: headers(),
    });
    if (!res.ok) {
      throw new Error(`[cobra] snapshot failed: ${res.status}`);
    }
    return (await res.json()) as SnapshotResponse;
  },
};
