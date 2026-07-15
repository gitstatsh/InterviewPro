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
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  TraceMap,
  eachMapping,
  originalPositionFor,
} from "@jridgewell/trace-mapping";
import type { CoveredScript } from "./cobra-client.js";
import type { BrowserCoverageEntry } from "./cobra-browser-coverage.js";
import type {
  BrowserSourceMapDiagnostics,
  FileCoverage,
} from "./cobra-shape.js";

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

type TrailingSourceMapDirective = {
  reference: string;
  startOffset: number;
};

/** Parses one line-comment sourceMappingURL directive at strict EOF. */
function trailingSourceMapDirective(
  source: string
): TrailingSourceMapDirective | undefined {
  const match = /(?:\r?\n)?\/\/[#@][ \t]*sourceMappingURL=([^\r\n]+?)[ \t]*(?:\r?\n)?$/.exec(
    source
  );
  const reference = match?.[1]?.trim();
  if (!match || !reference) return undefined;
  return { reference, startOffset: match.index };
}

function extractSourceMap(
  source: string,
  fileUrl: string
): { url: string; map: any } | undefined {
  const directive = trailingSourceMapDirective(source);
  if (!directive) return undefined;
  const ref = directive.reference;

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
  const directive = trailingSourceMapDirective(source);
  if (!directive) return undefined;
  const ref = directive.reference;
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
      redirect: "error",
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    if (res.url) {
      const finalUrl = new URL(res.url);
      if (finalUrl.origin !== new URL(jsUrl).origin) return undefined;
    }
    return { url: mapUrl.toString(), map: normalizeMapSources(await res.json()) };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

type LocalSourceMapCandidate = Readonly<{
  canonicalSource: string;
  mapUrl: string;
  rawMap: string;
  map: Readonly<Record<string, unknown>>;
  resolvedSources: string;
}>;

type LocalSourceMapIndex = Map<
  string,
  ReadonlyArray<LocalSourceMapCandidate>
>;

const localSourceMapIndexes = new Map<string, LocalSourceMapIndex>();

/**
 * Removes only a final sourceMappingURL line (and the newline which introduces
 * that line). No other whitespace or generated code is normalized: a local
 * source map is eligible only when the remaining JavaScript is exact.
 */
function canonicalGeneratedSource(source: string): string {
  const directive = trailingSourceMapDirective(source);
  return directive ? source.slice(0, directive.startOffset) : source;
}

function sourceDigest(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function isWithinDirectory(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function referencedLocalMap(
  directory: string,
  scriptPath: string,
  reference: string
): string | undefined {
  try {
    const mapUrl = new URL(reference, pathToFileURL(scriptPath));
    if (mapUrl.protocol !== "file:" || mapUrl.search || mapUrl.hash) {
      return undefined;
    }
    const mapPath = fs.realpathSync(fileURLToPath(mapUrl));
    if (!isWithinDirectory(directory, mapPath)) return undefined;
    return fs.statSync(mapPath).isFile() ? mapPath : undefined;
  } catch {
    return undefined;
  }
}

function buildLocalSourceMapIndex(directory: string): LocalSourceMapIndex {
  const index: LocalSourceMapIndex = new Map();

  const visit = (current: string): void => {
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

      try {
        const generatedSource = fs.readFileSync(fullPath, "utf8");
        const directive = trailingSourceMapDirective(generatedSource);
        if (!directive) continue;
        const mapPath = referencedLocalMap(
          directory,
          fullPath,
          directive.reference
        );
        if (!mapPath) continue;

        const rawMap = fs.readFileSync(mapPath, "utf8");
        const parsed: unknown = JSON.parse(rawMap);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          continue;
        }
        const mapUrl = pathToFileURL(mapPath).toString();
        const map = Object.freeze(
          normalizeMapSources(parsed) as Record<string, unknown>
        );
        const resolvedSources = JSON.stringify(
          new TraceMap(map as any, mapUrl).resolvedSources
        );
        const canonicalSource = generatedSource.slice(
          0,
          directive.startOffset
        );
        const candidate = Object.freeze({
          canonicalSource,
          mapUrl,
          rawMap,
          map,
          resolvedSources,
        });
        const digest = sourceDigest(canonicalSource);
        const candidates = [...(index.get(digest) ?? []), candidate];
        index.set(digest, Object.freeze(candidates));
      } catch {
        // A malformed or stale local pair is not a source-map candidate.
        continue;
      }
    }
  };

  visit(directory);
  return index;
}

function configuredLocalSourceMapIndex(): LocalSourceMapIndex | undefined {
  const configured = process.env.COBRA_LOCAL_SOURCE_MAP_DIR?.trim();
  if (!configured) return undefined;

  try {
    const configuredPath = path.isAbsolute(configured)
      ? configured
      : path.resolve(REPO_ROOT, configured);
    const directory = fs.realpathSync(configuredPath);
    if (!fs.statSync(directory).isDirectory()) return undefined;
    const cached = localSourceMapIndexes.get(directory);
    if (cached) return cached;
    const index = buildLocalSourceMapIndex(directory);
    localSourceMapIndexes.set(directory, index);
    return index;
  } catch {
    // Missing/unreadable build artifacts are an unavailable fallback, not a
    // reason to weaken capture or accept a filename-only match.
    return undefined;
  }
}

/**
 * Resolves a source map from an explicitly configured local production build.
 * The digest is only an index: exact canonical JavaScript equality is checked
 * before a cached map is used. Multiple exact scripts with different maps are
 * deliberately rejected as ambiguous.
 */
function localExactBrowserSourceMap(
  source: string
): { url: string; map: any } | undefined {
  const index = configuredLocalSourceMapIndex();
  if (!index) return undefined;

  const canonicalSource = canonicalGeneratedSource(source);
  const candidates = (index.get(sourceDigest(canonicalSource)) ?? []).filter(
    (candidate) => candidate.canonicalSource === canonicalSource
  );
  if (candidates.length === 0) return undefined;

  let selected: LocalSourceMapCandidate | undefined;
  for (const candidate of candidates) {
    if (
      selected &&
      (selected.rawMap !== candidate.rawMap ||
        selected.resolvedSources !== candidate.resolvedSources)
    ) {
      return undefined;
    }
    selected = selected ?? candidate;
  }

  return selected ? { url: selected.mapUrl, map: selected.map } : undefined;
}

function isBrowserJavaScript(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith(".js");
  } catch {
    return false;
  }
}

function isExistingRepositorySourcePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  if (!/^(apps|packages)\/[^/]+\/src\//.test(normalized)) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) =>
    segment.length === 0 || segment === "." || segment === ".."
  )) {
    return false;
  }

  const absolute = path.resolve(REPO_ROOT, ...segments);
  const relative = path.relative(REPO_ROOT, absolute);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return false;
  }

  try {
    const realPath = fs.realpathSync(absolute);
    const realRelative = path.relative(REPO_ROOT, realPath);
    return (
      !realRelative.startsWith("..") &&
      !path.isAbsolute(realRelative) &&
      fs.statSync(realPath).isFile()
    );
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V8 range arithmetic — turn (function ranges) into (executed byte intervals)
// ────────────────────────────────────────────────────────────────────────────

/**
 * V8 reports ranges independently for the script, its nested functions, and
 * block-coverage branches. Unioning positive ranges is incorrect: the
 * positive script range would cover a nested function whose own outer range
 * has count=0.
 *
 * V8 ranges are properly nested or disjoint. Sweep their boundaries while
 * keeping that nesting on a stack; its top is the most-specific active range.
 * Equal ranges conservatively put count=0 on top. Malformed/crossing ranges
 * fail closed instead of manufacturing executed lines.
 */
function computeExecutedIntervals(
  functions: V8Function[],
  sourceLength: number
): Array<[number, number]> {
  const starts = new Map<number, V8Range[]>();
  const boundaries = new Set<number>();

  for (const fn of functions) {
    for (const range of fn.ranges) {
      if (
        !Number.isSafeInteger(range.startOffset) ||
        !Number.isSafeInteger(range.endOffset) ||
        !Number.isFinite(range.count) ||
        range.count < 0 ||
        range.startOffset < 0 ||
        range.endOffset <= range.startOffset ||
        range.endOffset > sourceLength
      ) {
        return [];
      }
      const atOffset = starts.get(range.startOffset) ?? [];
      atOffset.push(range);
      starts.set(range.startOffset, atOffset);
      boundaries.add(range.startOffset);
      boundaries.add(range.endOffset);
    }
  }

  const offsets = [...boundaries].sort((left, right) => left - right);
  if (offsets.length < 2) return [];

  const active: V8Range[] = [];
  const executed: Array<[number, number]> = [];

  for (let i = 0; i < offsets.length - 1; i++) {
    const offset = offsets[i];

    while (active.at(-1)?.endOffset === offset) active.pop();

    const beginning = starts.get(offset);
    if (beginning) {
      beginning.sort((left, right) => {
        // Wider ranges are pushed first, leaving the narrowest on top.
        const byEnd = right.endOffset - left.endOffset;
        if (byEnd !== 0) return byEnd;
        // Identical contradictory ranges are ambiguous, so zero wins.
        return Number(left.count === 0) - Number(right.count === 0);
      });

      for (const range of beginning) {
        const parent = active.at(-1);
        if (parent && range.endOffset > parent.endOffset) return [];
        active.push(range);
      }
    }

    const end = offsets[i + 1];
    if (active.length === 0 || active.at(-1)?.count === 0) continue;

    const previous = executed.at(-1);
    if (previous?.[1] === offset) previous[1] = end;
    else executed.push([offset, end]);
  }

  return executed;
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
  const intervals = computeExecutedIntervals(functions, source.length);
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

export type BrowserCoverageConversion = {
  files: FileCoverage[];
  sourceMaps: BrowserSourceMapDiagnostics;
};

export async function convertBrowserCoverageWithDiagnostics(
  entries: BrowserCoverageEntry[]
): Promise<BrowserCoverageConversion> {
  const touched: TouchedByFile = new Map();
  const sourceMaps: BrowserSourceMapDiagnostics = {
    totalScripts: 0,
    resolvedHostedMaps: 0,
    resolvedLocalExactMaps: 0,
    unresolvedMaps: 0,
  };

  for (const entry of entries) {
    const trackedScript = entry.source.length > 0 && isBrowserJavaScript(entry.url);
    if (trackedScript) sourceMaps.totalScripts += 1;

    try {
      const hostedMap = await fetchBrowserSourceMap(entry.url, entry.source);
      const localMap = hostedMap
        ? undefined
        : localExactBrowserSourceMap(entry.source);
      const sm = hostedMap ?? localMap;
      debug(
        `browser ${entry.url.replace(/.*\//, "")} ` +
          `sm=${hostedMap ? "hosted" : localMap ? "local-exact" : "NO"} ` +
          `srcLen=${entry.source.length} ` +
          `fns=${entry.functions.length}`
      );
      decodeScript(entry.url, entry.source, entry.functions as V8Function[], sm, touched);
      if (trackedScript) {
        if (hostedMap) sourceMaps.resolvedHostedMaps += 1;
        else if (localMap) sourceMaps.resolvedLocalExactMaps += 1;
        else sourceMaps.unresolvedMaps += 1;
      }
      debugDump("browser", entry.url, entry.source, sm, entry.functions, touched);
    } catch (err) {
      if (trackedScript) sourceMaps.unresolvedMaps += 1;
      debug(`browser entry failed:`, (err as Error).message);
    }
  }
  return {
    files: finalise(touched).filter((file) =>
      isExistingRepositorySourcePath(file.path)
    ),
    sourceMaps,
  };
}

export async function convertBrowserCoverage(
  entries: BrowserCoverageEntry[]
): Promise<FileCoverage[]> {
  return (await convertBrowserCoverageWithDiagnostics(entries)).files;
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
