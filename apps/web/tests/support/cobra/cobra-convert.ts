/**
 * COBRA — convert raw V8 coverage into per-file "touched functions/lines".
 *
 * DESIGN: We deliberately DO NOT use v8-to-istanbul here. That library is
 * built for the c8/nyc "coverage over the whole process lifetime" model:
 * every source line starts at count=1 (see v8-to-istanbul/lib/line.js:16)
 * and gets zeroed out only when V8 emits an explicit uncovered range.
 * That's the exact opposite of what we need — under COBRA we reset V8's
 * counters at the start of each test, so V8 only emits ranges for the
 * functions that actually ran in that test's window. Everything else
 * (module-level imports, unused exports, other functions in the same
 * file) has *no* V8 range, and v8-to-istanbul would falsely mark it all
 * as executed. We'd end up with every test "touching" every line of
 * every file that had at least one function invoked.
 *
 * Instead we walk V8's ranges directly:
 *   1. Compute the executed byte intervals per script (outer function
 *      range MINUS any nested zero-count sub-ranges — those are V8's
 *      block-coverage "holes" for unhit branches).
 *   2. Iterate the source map's mappings. Each mapping's generated
 *      (line, col) is converted to a byte offset in the transpiled
 *      source. If that offset falls inside any executed interval, we
 *      record the mapping's ORIGINAL (source file, line) as touched.
 *
 * That gives us exactly what executed in this test — nothing inferred,
 * nothing defaulted.
 *
 * Two flavors of input:
 *   • server: CoveredScript[] from the API's inspector session. Local tsx
 *     supplies an inline map; compiled remote deployments attach the parsed
 *     external map because the runner cannot read the container filesystem.
 *   • browser: BrowserCoverageEntry[] from Playwright. url is the
 *     Next.js chunk; sourceMappingURL points at a .map fetched over
 *     HTTP from the dev server.
 *
 * Output paths are normalised to repository-relative POSIX so the
 * impact analyzer can diff paths against git output regardless of OS.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TraceMap,
  eachMapping,
  originalPositionFor,
} from "@jridgewell/trace-mapping";
import type { CoveredScript } from "./cobra-client.js";
import type { BrowserCoverageEntry } from "./cobra-browser-coverage.js";
import type { FileCoverage } from "./cobra-shape.js";

/** Repo root — five segments up from apps/web/tests/support/cobra. */
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

type V8Range = { startOffset: number; endOffset: number; count: number };
type V8Function = {
  functionName: string;
  ranges: V8Range[];
  isBlockCoverage: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// Source map extraction
//   • server scripts (tsx): inline base64 data URI in a sourceMappingURL
//     comment at the end of the executed source.
//   • browser chunks (Next.js dev): sourceMappingURL points at a sibling
//     .map file that we fetch over HTTP from the dev server.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Windows drive-letter paths ("C:\\Users\\…" or "C:/Users/…") appear
 * verbatim in esbuild/tsx inline source maps' `sources` array, but
 * @jridgewell/trace-mapping treats them as relative URIs and joins
 * them against the map URL (producing garbage like
 * ".../src/C:/Users/.../foo.ts"). Rewrite them to real file:// URIs so
 * TraceMap's resolvedSources come out clean regardless of mapUrl.
 */
function normalizeMapSources(map: any): any {
  if (!map || !Array.isArray(map.sources)) return map;
  const sources = map.sources.map((s: string | null) => {
    if (typeof s !== "string") return s;
    if (/^[A-Za-z]:[\\/]/.test(s)) {
      return "file:///" + s.replace(/\\/g, "/");
    }
    return s;
  });
  return { ...map, sources };
}

function extractSourceMap(
  source: string,
  fileUrl: string
): { url: string; map: any } | undefined {
  const match = source.match(/\/\/# sourceMappingURL=(.+)\s*$/m);
  if (!match) return undefined;
  const ref = match[1].trim();

  if (ref.startsWith("data:")) {
    const commaIdx = ref.indexOf(",");
    const payload = ref.slice(commaIdx + 1);
    const isBase64 = ref.slice(0, commaIdx).includes(";base64");
    const raw = isBase64
      ? Buffer.from(payload, "base64").toString("utf8")
      : decodeURIComponent(payload);
    try {
      return { url: fileUrl, map: normalizeMapSources(JSON.parse(raw)) };
    } catch {
      return undefined;
    }
  }

  if (fileUrl.startsWith("file://")) {
    const filePath = new URL(fileUrl).pathname;
    const mapPath = path.resolve(path.dirname(filePath), ref);
    try {
      return {
        url: fileUrl,
        map: normalizeMapSources(JSON.parse(fs.readFileSync(mapPath, "utf8"))),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function suppliedServerSourceMap(
  script: CoveredScript
): { url: string; map: any } | undefined {
  if (
    !script.sourceMap ||
    typeof script.sourceMap !== "object" ||
    Array.isArray(script.sourceMap)
  ) {
    return undefined;
  }
  const url = script.sourceMapUrl?.trim() || script.url;
  return { url, map: normalizeMapSources(script.sourceMap) };
}

async function fetchBrowserSourceMap(
  jsUrl: string,
  source: string
): Promise<{ url: string; map: any } | undefined> {
  const match = source.match(/\/\/# sourceMappingURL=(.+)\s*$/m);
  if (!match) return undefined;
  const ref = match[1].trim();
  if (ref.startsWith("data:")) {
    return extractSourceMap(source, jsUrl);
  }
  let mapUrl: URL;
  try {
    const scriptUrl = new URL(jsUrl);
    mapUrl = new URL(ref, scriptUrl);
    if (
      mapUrl.origin !== scriptUrl.origin ||
      !["http:", "https:"].includes(mapUrl.protocol)
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(mapUrl, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    return { url: mapUrl.toString(), map: normalizeMapSources(await res.json()) };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V8 range arithmetic — turn (function ranges) into (executed byte intervals)
// ────────────────────────────────────────────────────────────────────────────

/**
 * V8 block coverage semantics: fn.ranges[0] is the function's outer
 * extent; subsequent entries are nested sub-ranges. A nested range with
 * count=0 marks a block that DID NOT run (e.g. the body of an if that
 * evaluated false). A nested range with count>0 is redundant with the
 * outer coverage for our purposes.
 */
function executedIntervalsForFunction(fn: V8Function): Array<[number, number]> {
  if (fn.ranges.length === 0) return [];
  const outer = fn.ranges[0];
  if (outer.count === 0) return [];

  let intervals: Array<[number, number]> = [[outer.startOffset, outer.endOffset]];
  for (let i = 1; i < fn.ranges.length; i++) {
    const r = fn.ranges[i];
    if (r.count > 0) continue;
    intervals = subtractInterval(intervals, r.startOffset, r.endOffset);
  }
  return intervals;
}

function subtractInterval(
  intervals: Array<[number, number]>,
  a: number,
  b: number
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [s, e] of intervals) {
    if (b <= s || a >= e) {
      out.push([s, e]);
      continue;
    }
    if (s < a) out.push([s, a]);
    if (b < e) out.push([b, e]);
  }
  return out;
}

function mergeIntervals(
  intervals: Array<[number, number]>
): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const [s, e] = sorted[i];
    if (s <= prev[1]) prev[1] = Math.max(prev[1], e);
    else out.push([s, e]);
  }
  return out;
}

function computeExecutedIntervals(functions: V8Function[]): Array<[number, number]> {
  const all: Array<[number, number]> = [];
  for (const fn of functions) {
    for (const iv of executedIntervalsForFunction(fn)) all.push(iv);
  }
  return mergeIntervals(all);
}

// ────────────────────────────────────────────────────────────────────────────
// Offset ↔ line/col helpers (transpiled source coordinates)
// ────────────────────────────────────────────────────────────────────────────

function buildLineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) offsets.push(i + 1);
  }
  return offsets;
}

function offsetToLineCol(
  offset: number,
  lineOffsets: number[]
): { line: number; column: number } {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineOffsets[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineOffsets[lo] };
}

function isInsideAny(
  offset: number,
  intervals: Array<[number, number]>
): boolean {
  let lo = 0;
  let hi = intervals.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [s, e] = intervals[mid];
    if (offset < s) hi = mid - 1;
    else if (offset >= e) lo = mid + 1;
    else return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Source-map decode of executed intervals → touched (source file, line) pairs
// ────────────────────────────────────────────────────────────────────────────

type TouchedByFile = Map<string, { lines: Set<number>; fns: Set<string> }>;

function bucketFor(map: TouchedByFile, key: string) {
  let b = map.get(key);
  if (!b) {
    b = { lines: new Set(), fns: new Set() };
    map.set(key, b);
  }
  return b;
}

function decodeScript(
  scriptUrl: string,
  source: string,
  functions: V8Function[],
  sm: { url: string; map: any } | undefined,
  into: TouchedByFile
): void {
  const intervals = computeExecutedIntervals(functions);
  if (intervals.length === 0) return;

  const lineOffsets = buildLineOffsets(source);

  // Fallback: no source map → attribute lines to the script itself.
  // Best-effort; the impact analyzer would prefer a mapped .ts path,
  // but this at least records that *something* in this script ran.
  if (!sm) {
    // Deployed browser chunk URLs are not repository source paths. Their
    // generated coverage is stored separately in browserChunks.
    if (/^https?:\/\//i.test(scriptUrl)) return;
    const key = toRepoRelative(scriptUrl);
    const bucket = bucketFor(into, key);
    for (const [s, e] of intervals) {
      const start = offsetToLineCol(s, lineOffsets);
      const end = offsetToLineCol(Math.max(s, e - 1), lineOffsets);
      for (let l = start.line; l <= end.line; l++) bucket.lines.add(l);
    }
    for (const fn of functions) {
      if (fn.functionName && fn.ranges[0]?.count > 0) {
        bucket.fns.add(fn.functionName);
      }
    }
    return;
  }

  const traceMap = new TraceMap(sm.map, sm.url);

  eachMapping(traceMap, (m) => {
    if (m.source == null || m.originalLine == null) return;
    const genOffset =
      (lineOffsets[m.generatedLine - 1] ?? 0) + m.generatedColumn;
    if (!isInsideAny(genOffset, intervals)) return;
    const key = toRepoRelative(m.source);
    if (isIgnorablePath(key)) return;
    bucketFor(into, key).lines.add(m.originalLine);
  });

  // Function names: for each V8 function that ran, resolve its start
  // offset back to a source file via the map and attach the name there.
  for (const fn of functions) {
    if (!fn.functionName || fn.ranges.length === 0) continue;
    if (fn.ranges[0].count === 0) continue;
    const startOffset = fn.ranges[0].startOffset;
    const genPos = offsetToLineCol(startOffset, lineOffsets);
    const orig = originalPositionFor(traceMap, {
      line: genPos.line,
      column: genPos.column,
    });
    if (!orig || orig.source == null) continue;
    const key = toRepoRelative(orig.source);
    if (isIgnorablePath(key)) continue;
    bucketFor(into, key).fns.add(fn.functionName);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Path normalisation
// ────────────────────────────────────────────────────────────────────────────

function toRepoRelative(source: string): string {
  let p = source;
  // Common source-map source URI shapes:
  //   file:///C:/…/foo.ts        (server, tsx inline maps)
  //   webpack:///./app/foo.tsx   (Next.js)
  //   /_next/…                   (fetched chunk with no source map)
  //   plain absolute path        (some maps just give raw paths)
  if (p.startsWith("file://")) {
    // Use fileURLToPath so spaces (%20) etc. get decoded to real chars,
    // otherwise path.relative can't share a common prefix with REPO_ROOT
    // (which is a real filesystem path) and returns a giant "../../.."
    // traversal.
    try {
      p = fileURLToPath(p);
    } catch {
      p = decodeURIComponent(new URL(p).pathname);
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
    }
  } else if (p.startsWith("webpack://")) {
    p = p.replace(/^webpack:\/\/(?:[^/]*)?\/?/, "");
    p = p.replace(/^\.\//, "");
    // A webpack source might live in the repo already (e.g. "app/foo.tsx");
    // if so, prefix repo root so path.relative works uniformly.
    if (!path.isAbsolute(p)) p = path.join(REPO_ROOT, "apps", "web", p);
  }

  // Source maps from a hosted container commonly resolve to
  // file:///app/apps/... or file:///workspace/packages/.... Those absolute
  // paths do not share a filesystem root with the Windows/Linux test runner,
  // but the apps/ and packages/ suffixes are stable repository identities.
  const portable = p
    .replace(/\\/g, "/")
    .match(/(?:^|\/)(apps|packages)\/(.+)$/);
  if (portable) return `${portable[1]}/${portable[2]}`;

  if (!path.isAbsolute(p)) return p.split(path.sep).join("/");
  const rel = path.relative(REPO_ROOT, p);
  return rel.split(path.sep).join("/");
}

function isIgnorablePath(p: string): boolean {
  // Skip third-party / build-tool sources that show up in maps but
  // aren't part of the impact-analysis surface for app code.
  return (
    p.includes("node_modules/") ||
    p.startsWith("webpack/") ||
    p.startsWith("../../node_modules/") ||
    p.startsWith("../node_modules/")
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function convertServerCoverage(
  scripts: CoveredScript[]
): Promise<FileCoverage[]> {
  const touched: TouchedByFile = new Map();
  for (const script of scripts) {
    try {
      const sm =
        suppliedServerSourceMap(script) ??
        extractSourceMap(script.source, script.url);
      debug(
        `server ${script.url.replace(/.*\//, "")} ` +
          `sm=${sm ? "yes" : "NO"} srcLen=${script.source.length} ` +
          `fns=${script.functions.length}`
      );
      decodeScript(script.url, script.source, script.functions as V8Function[], sm, touched);
      debugDump("server", script.url, script.source, sm, script.functions, touched);
    } catch (err) {
      debug(`server script failed:`, (err as Error).message);
    }
  }
  return finalise(touched);
}

export async function convertBrowserCoverage(
  entries: BrowserCoverageEntry[]
): Promise<FileCoverage[]> {
  const touched: TouchedByFile = new Map();
  for (const entry of entries) {
    try {
      const sm = await fetchBrowserSourceMap(entry.url, entry.source);
      debug(
        `browser ${entry.url.replace(/.*\//, "")} ` +
          `sm=${sm ? "yes" : "NO"} srcLen=${entry.source.length} ` +
          `fns=${entry.functions.length}`
      );
      decodeScript(entry.url, entry.source, entry.functions as V8Function[], sm, touched);
      debugDump("browser", entry.url, entry.source, sm, entry.functions, touched);
    } catch (err) {
      debug(`browser entry failed:`, (err as Error).message);
    }
  }
  return finalise(touched);
}

function finalise(touched: TouchedByFile): FileCoverage[] {
  const out: FileCoverage[] = [];
  for (const [p, { lines, fns }] of touched) {
    if (lines.size === 0 && fns.size === 0) continue;
    out.push({
      path: p,
      functionsTouched: [...fns].filter((n) => n && n !== "(anonymous_0)").sort(),
      linesTouched: [...lines].sort((a, b) => a - b),
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function mergeFileCoverage(
  a: FileCoverage[],
  b: FileCoverage[]
): FileCoverage[] {
  const byPath = new Map<string, FileCoverage>();
  for (const list of [a, b]) {
    for (const fc of list) {
      const existing = byPath.get(fc.path);
      if (!existing) {
        byPath.set(fc.path, {
          path: fc.path,
          functionsTouched: [...fc.functionsTouched],
          linesTouched: [...fc.linesTouched],
        });
        continue;
      }
      const fns = new Set([...existing.functionsTouched, ...fc.functionsTouched]);
      const lines = new Set([...existing.linesTouched, ...fc.linesTouched]);
      existing.functionsTouched = [...fns].sort();
      existing.linesTouched = [...lines].sort((x, y) => x - y);
    }
  }
  return [...byPath.values()].sort((x, y) => x.path.localeCompare(y.path));
}

// ────────────────────────────────────────────────────────────────────────────
// Debug plumbing (opt-in via COBRA_DEBUG=1)
// ────────────────────────────────────────────────────────────────────────────

const DEBUG = process.env.COBRA_DEBUG === "1";
const DEBUG_DIR = path.join(REPO_ROOT, ".cobra", "debug");
let debugSeq = 0;

function debug(...args: unknown[]): void {
  if (DEBUG) console.error("[cobra:convert]", ...args);
}

function debugDump(
  kind: string,
  url: string,
  source: string,
  sm: { url: string; map: any } | undefined,
  functions: unknown,
  touched: TouchedByFile
): void {
  if (!DEBUG) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const idx = String(++debugSeq).padStart(4, "0");
    const safe = url.replace(/[^a-zA-Z0-9]+/g, "_").slice(-80);
    const base = path.join(DEBUG_DIR, `${idx}-${kind}-${safe}`);
    fs.writeFileSync(`${base}.source.txt`, source);
    fs.writeFileSync(
      `${base}.meta.json`,
      JSON.stringify(
        {
          url,
          sourceLen: source.length,
          hasSourceMappingURL: /\/\/# sourceMappingURL=/.test(source),
          sourceMapExtracted: !!sm,
          sourceMapSources: sm?.map?.sources,
          functionCount: Array.isArray(functions) ? functions.length : 0,
          touchedFiles: [...touched.keys()],
        },
        null,
        2
      )
    );
    if (sm?.map) {
      fs.writeFileSync(`${base}.map.json`, JSON.stringify(sm.map, null, 2));
    }
  } catch {
    // debug is best-effort; never blow up the real pipeline
  }
}
