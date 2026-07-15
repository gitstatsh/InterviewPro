/**
 * COBRA — V8 precise-coverage capture for the long-lived Fastify process.
 *
 * Uses node:inspector's in-process Session so we don't need --inspect on the
 * CLI. Coverage is process-global; per-test attribution is only meaningful
 * when tests run serially against this process (Playwright workers=1 under
 * TEST_MODE=1). See COBRA README/plan for the rationale.
 *
 * The "reset" operation is a discarded snapshot: V8's precise coverage is a
 * monotonic counter that Profiler.takePreciseCoverage drains, so taking and
 * throwing away a snapshot gives us a clean starting point for the next test.
 *
 * Snapshots include the actual EXECUTED source per script (fetched via
 * Debugger.getScriptSource). This matters because tsx transpiles .ts files
 * on the fly; the on-disk .ts and V8's byte offsets don't line up. Shipping
 * the executed source (with its inline sourceMappingURL data URI) lets the
 * client resolve V8 byte offsets back to original .ts line numbers via the
 * source map — see apps/web/tests/support/cobra/cobra-convert.ts.
 */

import { Session } from "node:inspector";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

type ScriptCoverage = {
  scriptId: string;
  url: string;
  functions: Array<{
    functionName: string;
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
    isBlockCoverage: boolean;
  }>;
};

type TakePreciseCoverageResult = {
  result: ScriptCoverage[];
  timestamp: number;
};

/**
 * Snapshot entry augmented with the executed source text and, for compiled
 * deployments, the external source map read by the API process itself.
 * A remote test runner cannot read file:///app/.../*.js.map directly.
 */
export type CoveredScript = ScriptCoverage & {
  source: string;
  sourceMap?: Record<string, unknown>;
  sourceMapUrl?: string;
};

let session: Session | null = null;
let post: <T = unknown>(
  method: string,
  params?: Record<string, unknown>
) => Promise<T>;
let started = false;

/**
 * Files we never want to report on. Coverage output from Node internals,
 * dependencies, or the coverage harness itself is noise for impact analysis.
 */
const EXCLUDE_URL_PATTERNS = [
  /^node:/,
  /[\\/]node_modules[\\/]/,
  /[\\/]testing[\\/]cobra-/,
  /[\\/]\.pnpm[\\/]/,
];

function shouldIncludeScript(url: string): boolean {
  if (!url) return false;
  // Only consider file:// URLs — inline scripts, eval, and REPL entries lack
  // a resolvable source file and can't be mapped back for impact analysis.
  if (!url.startsWith("file://")) return false;
  return !EXCLUDE_URL_PATTERNS.some((re) => re.test(url));
}

function externalSourceMapReference(source: string): string | undefined {
  const pattern = /\/\/[#@]\s*sourceMappingURL=([^\r\n]+)/g;
  let reference: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    reference = match[1].trim();
  }
  if (!reference || reference.startsWith("data:")) return undefined;
  return reference;
}

/**
 * Resolve an external sourceMappingURL inside the API container and return a
 * JSON-safe payload. This is intentionally file:// only: snapshot collection
 * must never turn source-map comments into arbitrary network requests.
 */
export async function loadExternalSourceMap(
  source: string,
  scriptUrl: string
): Promise<
  | { sourceMap: Record<string, unknown>; sourceMapUrl: string }
  | undefined
> {
  const reference = externalSourceMapReference(source);
  if (!reference || !scriptUrl.startsWith("file://")) return undefined;

  try {
    const mapUrl = new URL(reference, scriptUrl);
    if (mapUrl.protocol !== "file:") return undefined;
    const parsed = JSON.parse(
      await readFile(fileURLToPath(mapUrl), "utf8")
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return {
      sourceMap: parsed as Record<string, unknown>,
      sourceMapUrl: mapUrl.toString(),
    };
  } catch {
    // A missing or malformed map should degrade to generated coverage instead
    // of making the protected snapshot endpoint fail.
    return undefined;
  }
}

/**
 * Idempotent. Safe to call from multiple entry points during startup.
 */
export async function startCoverageSession(): Promise<void> {
  if (started) return;

  session = new Session();
  session.connect();

  // Wrap Session.post in a promise API — the callback form is awkward and
  // we want to await inside route handlers.
  const rawPost = session.post.bind(session) as (
    method: string,
    params: Record<string, unknown> | undefined,
    cb: (err: Error | null, res: unknown) => void
  ) => void;
  const promisifiedPost = promisify(rawPost);
  post = async <T>(method: string, params?: Record<string, unknown>) => {
    return (await promisifiedPost(method, params ?? {})) as T;
  };

  // Debugger domain is required for getScriptSource; enabling it does NOT
  // pause execution — it just makes the source retrieval RPC available.
  await post("Debugger.enable");
  await post("Profiler.enable");
  await post("Profiler.startPreciseCoverage", {
    callCount: true,
    detailed: true,
  });

  started = true;
}

/**
 * Discards accumulated coverage so the next snapshot reflects only activity
 * from that point forward. Called at the start of each test.
 */
export async function resetCoverage(): Promise<void> {
  if (!started) await startCoverageSession();
  await post<TakePreciseCoverageResult>("Profiler.takePreciseCoverage");
}

/**
 * Returns V8 script-coverage entries collected since the last reset,
 * filtered to app code, with the executed source text attached.
 */
export async function takeCoverageSnapshot(): Promise<CoveredScript[]> {
  if (!started) await startCoverageSession();
  const { result } = await post<TakePreciseCoverageResult>(
    "Profiler.takePreciseCoverage"
  );
  const filtered = result.filter((entry) => shouldIncludeScript(entry.url));

  const enriched: CoveredScript[] = [];
  for (const entry of filtered) {
    try {
      const { scriptSource } = await post<{ scriptSource: string }>(
        "Debugger.getScriptSource",
        { scriptId: entry.scriptId }
      );
      const sourceMap = await loadExternalSourceMap(scriptSource, entry.url);
      enriched.push({ ...entry, source: scriptSource, ...sourceMap });
    } catch {
      // Scripts can be GC'd between coverage collection and source fetch
      // (short-lived dynamic imports, etc.). Skip rather than fail the whole
      // snapshot — a missing entry is safer than a broken one.
    }
  }
  return enriched;
}
