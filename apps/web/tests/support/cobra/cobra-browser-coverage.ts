/**
 * COBRA — browser-side coverage helpers built on Playwright's page.coverage.
 *
 * Chromium-only (Playwright's coverage API is Chromium-only, which matches
 * playwright.config.ts's single 'chromium' project). We intentionally use
 * resetOnNavigation:false so navigating between routes inside a test doesn't
 * discard earlier coverage.
 *
 * The returned entries carry the full source text plus V8's function-level
 * hit ranges — everything cobra-convert.ts needs to map back to source lines
 * via the chunk's sourcemap.
 */

import type { Page } from "@playwright/test";
import type { BrowserChunkCoverage } from "./cobra-shape.js";

export type BrowserCoverageEntry = {
  url: string;
  source: string;
  functions: Array<{
    functionName: string;
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
    isBlockCoverage: boolean;
  }>;
};

export async function startBrowserCoverage(page: Page): Promise<void> {
  await page.coverage.startJSCoverage({
    resetOnNavigation: false,
    reportAnonymousScripts: false,
  });
}

/**
 * Stops browser coverage and returns entries filtered to same-origin Next.js
 * chunks. Third-party scripts (analytics, fonts) are dropped because they
 * aren't in our source tree and would just add noise.
 */
export async function stopBrowserCoverage(
  page: Page
): Promise<BrowserCoverageEntry[]> {
  const raw = await page.coverage.stopJSCoverage();
  const origin = new URL(process.env.E2E_BASE_URL ?? page.url()).origin;
  return raw
    .filter((entry) => {
      try {
        return new URL(entry.url).origin === origin;
      } catch {
        return false;
      }
    })
    .map((entry) => ({
      url: entry.url,
      source: entry.source ?? "",
      functions: entry.functions,
    }));
}

/**
 * Converts V8's nested ranges into generated-script byte coverage. A
 * zero-count child range overrides a covered parent range, which is how V8
 * represents uncalled functions and unvisited branches inside a loaded
 * script.
 */
export function summarizeBrowserCoverage(
  entries: BrowserCoverageEntry[]
): BrowserChunkCoverage[] {
  const grouped = new Map<string, BrowserChunkCoverage>();

  for (const entry of entries.filter((item) => item.source.length > 0)) {
      const positive: Array<[number, number]> = [];
      const zero: Array<[number, number]> = [];

      for (const fn of entry.functions) {
        for (const range of fn.ranges) {
          const start = clamp(range.startOffset, 0, entry.source.length);
          const end = clamp(range.endOffset, start, entry.source.length);
          if (end <= start) continue;
          (range.count > 0 ? positive : zero).push([start, end]);
        }
      }

      let coveredRanges = mergeRanges(positive);
      for (const [start, end] of mergeRanges(zero)) {
        coveredRanges = subtractRange(coveredRanges, start, end);
      }
      const coveredBytes = coveredRanges.reduce(
        (sum, [start, end]) => sum + end - start,
        0
      );
      const totalBytes = entry.source.length;
      const current: BrowserChunkCoverage = {
        url: entry.url,
        script: displayScript(entry.url),
        totalBytes,
        coveredBytes,
        coveragePercent:
          totalBytes === 0
            ? 0
            : Number(((coveredBytes / totalBytes) * 100).toFixed(2)),
        coveredRanges,
      };

      const previous = grouped.get(entry.url);
      if (!previous) {
        grouped.set(entry.url, current);
        continue;
      }

      previous.totalBytes = Math.max(previous.totalBytes, current.totalBytes);
      previous.coveredRanges = mergeRanges([
        ...previous.coveredRanges,
        ...current.coveredRanges,
      ]).map(([start, end]) => [
        clamp(start, 0, previous.totalBytes),
        clamp(end, 0, previous.totalBytes),
      ]);
      previous.coveredBytes = previous.coveredRanges.reduce(
        (sum, [start, end]) => sum + end - start,
        0
      );
      previous.coveragePercent = Number(
        ((previous.coveredBytes / previous.totalBytes) * 100).toFixed(2)
      );
  }

  return [...grouped.values()].sort((a, b) =>
    a.script.localeCompare(b.script)
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function mergeRanges(
  ranges: Array<[number, number]>
): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];
    if (current[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], current[1]);
    } else {
      merged.push([current[0], current[1]]);
    }
  }
  return merged;
}

function subtractRange(
  ranges: Array<[number, number]>,
  removeStart: number,
  removeEnd: number
): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    if (removeEnd <= start || removeStart >= end) {
      result.push([start, end]);
      continue;
    }
    if (start < removeStart) result.push([start, removeStart]);
    if (removeEnd < end) result.push([removeEnd, end]);
  }
  return result;
}

function displayScript(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
