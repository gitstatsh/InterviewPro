/** Generates a standalone COBRA dashboard from local run and mapping data. */
import fs from "node:fs";
import path from "node:path";
import {
  buildCobraSourceInventory,
  isCobraSourceInventorySnapshot,
  normalizeInventoryPath,
  type CobraSourceInventory,
  type CobraSourceInventorySnapshot,
  type SourceLineRange,
} from "./cobra-source-inventory";

type CoveredRange = [number, number];

type BrowserChunkCoverage = {
  url: string;
  script: string;
  totalBytes: number;
  coveredBytes: number;
  coveragePercent: number;
  coveredRanges?: CoveredRange[];
};

type FileCoverage = {
  path: string;
  functionsTouched: string[];
  linesTouched: number[];
};

type PerTestCoverageDocument = {
  testId: string;
  specFile?: string;
  startedAt: string;
  durationMs: number;
  files?: FileCoverage[];
  browserChunks?: BrowserChunkCoverage[];
};

type RunIndexEntry = {
  testId: string;
  file: string;
  specFile?: string;
  startedAt: string;
  durationMs: number;
  fileCount: number;
  status: string;
};

type RunIndex = {
  runId: string;
  kind?: string;
  coverageMode?: string;
  targetUrl?: string;
  commitSha?: string;
  createdAt: string;
  finishedAt?: string;
  tests: RunIndexEntry[];
};

type ChangedFile = {
  path: string;
  status: string;
  lines?: number[];
  oldLines?: number[];
  structuralChange?: boolean;
};

type ExecutedTest = {
  testId: string;
  status: string;
  durationMs: number;
};

type BuildRecord = {
  id: string;
  baselineRunId?: string;
  commitSha: string;
  branch: string;
  source: string;
  receivedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  expectedTestCount?: number;
  strategy?: "source" | "modules";
  matchedModules?: string[];
  ignoredFiles?: string[];
  selectedSpecFiles?: string[];
  selectedTestTags?: string[];
  warnings?: string[];
  status: string;
  runId?: string;
  selection: {
    mode: string;
    reason: string;
    changedFiles: ChangedFile[];
    recommendedTests: string[];
    skippedTests: string[];
    unmappedFiles: string[];
  };
  executedTests: ExecutedTest[];
  error?: string;
};

export type CoverageDashboardOptions = {
  /** Override storage for tests or an alternate COBRA artifact volume. */
  cobraRoot?: string;
  /** Override repository root for tests or a relocated checkout. */
  repoRoot?: string;
};

type ScriptAggregate = {
  url: string;
  script: string;
  totalBytes: number;
  ranges: CoveredRange[];
  fallbackCoveredBytes: number;
  testIds: Set<string>;
  hasCompleteRangeData: boolean;
};

type ScriptRow = ScriptAggregate & {
  coveredBytes: number;
  percentage: number | null;
};

type TestSummary = {
  testId: string;
  specFile: string;
  status: string;
  durationMs: number;
  scriptCount: number;
  mappedSourceFileCount: number;
  coveredBytes: number;
  totalBytes: number;
  percentage: number | null;
};

type RuntimeSummary = {
  scripts: ScriptRow[];
  tests: TestSummary[];
  totalBytes: number;
  coveredBytes: number;
  percentage: number | null;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  incompleteRangeScripts: number;
};

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

/** Resolve storage at call time because runners may load env after this module. */
function getCobraRoot(repoRoot = REPO_ROOT): string {
  const configured = process.env.COBRA_STORAGE_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(repoRoot, ".cobra");
}

function safeRunId(runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
    throw new Error(`Invalid coverage run id: ${runId}`);
  }
  return runId;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCoveredRanges(value: unknown): value is CoveredRange[] {
  return (
    Array.isArray(value) &&
    value.every(
      (range) =>
        Array.isArray(range) &&
        range.length === 2 &&
        isFiniteNonNegativeNumber(range[0]) &&
        isFiniteNonNegativeNumber(range[1])
    )
  );
}

function isRunIndex(value: unknown, expectedRunId: string): value is RunIndex {
  if (
    !isRecord(value) ||
    value.runId !== expectedRunId ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.tests)
  ) {
    return false;
  }
  if (
    (value.kind !== undefined && typeof value.kind !== "string") ||
    (value.coverageMode !== undefined && typeof value.coverageMode !== "string") ||
    (value.targetUrl !== undefined && typeof value.targetUrl !== "string") ||
    (value.commitSha !== undefined && typeof value.commitSha !== "string") ||
    (value.finishedAt !== undefined && typeof value.finishedAt !== "string")
  ) {
    return false;
  }
  return value.tests.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.testId === "string" &&
      typeof entry.file === "string" &&
      (entry.specFile === undefined || typeof entry.specFile === "string") &&
      typeof entry.startedAt === "string" &&
      isFiniteNonNegativeNumber(entry.durationMs) &&
      isFiniteNonNegativeNumber(entry.fileCount) &&
      typeof entry.status === "string"
  );
}

function isPerTestCoverageDocument(value: unknown): value is PerTestCoverageDocument {
  if (
    !isRecord(value) ||
    typeof value.testId !== "string" ||
    typeof value.startedAt !== "string" ||
    !isFiniteNonNegativeNumber(value.durationMs)
  ) {
    return false;
  }
  if (value.specFile !== undefined && typeof value.specFile !== "string") return false;
  if (
    value.files !== undefined &&
    (!Array.isArray(value.files) ||
      !value.files.every(
        (file) =>
          isRecord(file) &&
          typeof file.path === "string" &&
          isStringArray(file.functionsTouched) &&
          Array.isArray(file.linesTouched) &&
          file.linesTouched.every((line) => Number.isInteger(line) && line > 0)
      ))
  ) {
    return false;
  }
  return (
    value.browserChunks === undefined ||
    (Array.isArray(value.browserChunks) &&
      value.browserChunks.every(
        (chunk) =>
          isRecord(chunk) &&
          typeof chunk.url === "string" &&
          typeof chunk.script === "string" &&
          isFiniteNonNegativeNumber(chunk.totalBytes) &&
          isFiniteNonNegativeNumber(chunk.coveredBytes) &&
          isFiniteNonNegativeNumber(chunk.coveragePercent) &&
          (chunk.coveredRanges === undefined || isCoveredRanges(chunk.coveredRanges))
      ))
  );
}

function isChangedFile(value: unknown): value is ChangedFile {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.status === "string" &&
    (value.lines === undefined ||
      (Array.isArray(value.lines) &&
        value.lines.every((line) => Number.isInteger(line) && line > 0))) &&
    (value.oldLines === undefined ||
      (Array.isArray(value.oldLines) &&
        value.oldLines.every((line) => Number.isInteger(line) && line > 0))) &&
    (value.structuralChange === undefined || typeof value.structuralChange === "boolean")
  );
}

function isBuildRecord(value: unknown): value is BuildRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.commitSha !== "string" ||
    typeof value.branch !== "string" ||
    typeof value.source !== "string" ||
    typeof value.receivedAt !== "string" ||
    typeof value.status !== "string" ||
    !isRecord(value.selection) ||
    !Array.isArray(value.executedTests)
  ) {
    return false;
  }
  const selection = value.selection;
  return (
    (value.baselineRunId === undefined || typeof value.baselineRunId === "string") &&
    (value.runId === undefined || typeof value.runId === "string") &&
    (value.startedAt === undefined || typeof value.startedAt === "string") &&
    (value.finishedAt === undefined || typeof value.finishedAt === "string") &&
    (value.durationMs === undefined || isFiniteNonNegativeNumber(value.durationMs)) &&
    (value.expectedTestCount === undefined ||
      isFiniteNonNegativeNumber(value.expectedTestCount)) &&
    (value.strategy === undefined ||
      value.strategy === "source" ||
      value.strategy === "modules") &&
    (value.matchedModules === undefined || isStringArray(value.matchedModules)) &&
    (value.ignoredFiles === undefined || isStringArray(value.ignoredFiles)) &&
    (value.selectedSpecFiles === undefined || isStringArray(value.selectedSpecFiles)) &&
    (value.selectedTestTags === undefined || isStringArray(value.selectedTestTags)) &&
    (value.warnings === undefined || isStringArray(value.warnings)) &&
    (value.error === undefined || typeof value.error === "string") &&
    typeof selection.mode === "string" &&
    typeof selection.reason === "string" &&
    Array.isArray(selection.changedFiles) &&
    selection.changedFiles.every(isChangedFile) &&
    isStringArray(selection.recommendedTests) &&
    isStringArray(selection.skippedTests) &&
    isStringArray(selection.unmappedFiles) &&
    value.executedTests.every(
      (test) =>
        isRecord(test) &&
        typeof test.testId === "string" &&
        typeof test.status === "string" &&
        isFiniteNonNegativeNumber(test.durationMs)
    )
  );
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mergeRanges(ranges: CoveredRange[], totalBytes: number): CoveredRange[] {
  const normalized = ranges
    .map(
      ([start, end]) =>
        [
          Math.max(0, Math.min(totalBytes, Math.floor(nonNegativeNumber(start)))),
          Math.max(0, Math.min(totalBytes, Math.floor(nonNegativeNumber(end)))),
        ] as CoveredRange
    )
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  const merged: CoveredRange[] = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (!previous || range[0] > previous[1]) {
      merged.push([...range] as CoveredRange);
    } else {
      previous[1] = Math.max(previous[1], range[1]);
    }
  }
  return merged;
}

function rangeBytes(ranges: CoveredRange[]): number {
  return ranges.reduce((total, [start, end]) => total + end - start, 0);
}

function percentage(covered: number, total: number): number | null {
  return total > 0 ? Math.min(100, (covered / total) * 100) : null;
}

function formatPercentage(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(1)}%`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatDuration(value: number | undefined): string {
  const duration = nonNegativeNumber(value);
  if (duration < 1000) return `${Math.round(duration)} ms`;
  if (duration < 60_000) return `${(duration / 1000).toFixed(1)} s`;
  return `${Math.floor(duration / 60_000)}m ${Math.round(
    (duration % 60_000) / 1000
  )}s`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "Not finished";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "passed") return "passed";
  if (normalized === "running") return "running";
  if (normalized === "queued" || normalized === "planned") return normalized;
  if (normalized === "skipped") return "skipped";
  return "failed";
}

function progressBar(value: number | null): string {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  const tone =
    value === null ? "unknown" : value >= 80 ? "good" : value >= 50 ? "medium" : "low";
  return `<div class="coverage-cell"><strong>${escapeHtml(
    formatPercentage(value)
  )}</strong><div class="bar" aria-hidden="true"><span class="${tone}" style="width:${width.toFixed(
    2
  )}%"></span></div></div>`;
}

function formatLineRanges(ranges: SourceLineRange[], limit = 12): string {
  if (ranges.length === 0) return "None";
  const visible = ranges
    .slice(0, limit)
    .map(([start, end]) => (start === end ? String(start) : `${start}-${end}`));
  const remaining = ranges.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? ` +${remaining} ranges` : ""}`;
}

function displayScript(script: ScriptAggregate): { title: string; detail: string } {
  const title = script.script || script.url || "Anonymous script";
  if (!script.url || script.url === title) return { title, detail: "" };
  try {
    const parsed = new URL(script.url);
    return { title, detail: `${parsed.host}${parsed.pathname}` };
  } catch {
    return { title, detail: script.url };
  }
}

function loadDocument(
  runDirectory: string,
  filename: string
): PerTestCoverageDocument | null {
  const candidate = path.resolve(runDirectory, filename);
  const relative = path.relative(runDirectory, candidate);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !fs.existsSync(candidate)
  ) {
    return null;
  }
  try {
    const document = readJson<unknown>(candidate);
    return isPerTestCoverageDocument(document) ? document : null;
  } catch {
    return null;
  }
}

function loadBuilds(cobraRoot: string): BuildRecord[] {
  const directory = path.join(cobraRoot, "builds");
  if (!fs.existsSync(directory)) return [];
  const builds: BuildRecord[] = [];
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith(".json")) continue;
    try {
      const build = readJson<unknown>(path.join(directory, name));
      if (isBuildRecord(build)) builds.push(build);
    } catch {
      // A malformed or partially-written build must not prevent report export.
    }
  }
  return builds.sort((left, right) =>
    right.receivedAt.localeCompare(left.receivedAt)
  );
}

type RunnerEvidence = Pick<
  BuildRecord,
  | "expectedTestCount"
  | "strategy"
  | "matchedModules"
  | "ignoredFiles"
  | "selectedSpecFiles"
  | "selectedTestTags"
  | "warnings"
>;

function loadRunnerEvidence(
  cobraRoot: string,
  build: BuildRecord
): RunnerEvidence | undefined {
  let runId: string;
  try {
    runId = safeRunId(build.runId ?? build.id);
  } catch {
    return undefined;
  }
  const file = path.join(cobraRoot, "runs", runId, "runner-metadata.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const value = readJson<unknown>(file);
    if (!isRecord(value) || value.runId !== runId) return undefined;
    if (
      (value.expectedTestCount !== undefined &&
        !isFiniteNonNegativeNumber(value.expectedTestCount)) ||
      (value.strategy !== undefined &&
        value.strategy !== "source" &&
        value.strategy !== "modules") ||
      (value.matchedModules !== undefined && !isStringArray(value.matchedModules)) ||
      (value.ignoredFiles !== undefined && !isStringArray(value.ignoredFiles)) ||
      (value.selectedSpecFiles !== undefined && !isStringArray(value.selectedSpecFiles)) ||
      (value.selectedTestTags !== undefined && !isStringArray(value.selectedTestTags)) ||
      (value.warnings !== undefined && !isStringArray(value.warnings))
    ) {
      return undefined;
    }
    return {
      expectedTestCount: value.expectedTestCount,
      strategy: value.strategy,
      matchedModules: value.matchedModules,
      ignoredFiles: value.ignoredFiles,
      selectedSpecFiles: value.selectedSpecFiles,
      selectedTestTags: value.selectedTestTags,
      warnings: value.warnings,
    } as RunnerEvidence;
  } catch {
    return undefined;
  }
}

function hydrateBuildEvidence(cobraRoot: string, build: BuildRecord): BuildRecord {
  const evidence = loadRunnerEvidence(cobraRoot, build);
  if (!evidence) return build;
  return {
    ...build,
    expectedTestCount: build.expectedTestCount ?? evidence.expectedTestCount,
    strategy: build.strategy ?? evidence.strategy,
    matchedModules: build.matchedModules ?? evidence.matchedModules,
    ignoredFiles: build.ignoredFiles ?? evidence.ignoredFiles,
    selectedSpecFiles: build.selectedSpecFiles ?? evidence.selectedSpecFiles,
    selectedTestTags: build.selectedTestTags ?? evidence.selectedTestTags,
    warnings: build.warnings ?? evidence.warnings,
  };
}

function associatedBuildForRun(
  index: RunIndex,
  builds: BuildRecord[]
): BuildRecord | undefined {
  return (
    builds.find((build) => build.runId === index.runId) ??
    builds.find((build) => build.id === index.runId)
  );
}

function recentBuilds(
  builds: BuildRecord[],
  associatedBuild: BuildRecord | undefined,
  limit = 30
): BuildRecord[] {
  const recent = builds.slice(0, limit);
  if (!associatedBuild || recent.some((build) => build.id === associatedBuild.id)) {
    return recent;
  }
  return [...recent, associatedBuild];
}

function normalizedArtifactPath(cobraRoot: string, artifact: string): string {
  return path.relative(cobraRoot, artifact).replace(/\\/g, "/");
}

function mappingArtifactForRun(
  cobraRoot: string,
  index: RunIndex,
  associatedBuild: BuildRecord | undefined
): string {
  const mappingDirectory = path.join(cobraRoot, "mappings");
  const baselineRunId = associatedBuild?.baselineRunId;
  if (baselineRunId && /^[a-zA-Z0-9._-]+$/.test(baselineRunId)) {
    const baselineMapping = path.join(mappingDirectory, `${baselineRunId}.json`);
    if (fs.existsSync(baselineMapping)) return baselineMapping;
  }

  // Baselines use their run id as the immutable mapping artifact name. This
  // also supports older indexes which did not record baseline provenance.
  const runMapping = path.join(mappingDirectory, `${index.runId}.json`);
  if (fs.existsSync(runMapping)) return runMapping;
  return path.join(mappingDirectory, "latest.json");
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporary, file);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function writeTextAtomic(file: string, value: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, value, "utf8");
    fs.renameSync(temporary, file);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function sourceInventoryForRun(
  cobraRoot: string,
  repoRoot: string,
  runDirectory: string,
  index: RunIndex,
  associatedBuild: BuildRecord | undefined
): CobraSourceInventorySnapshot {
  const snapshotFile = path.join(runDirectory, "source-inventory.json");
  try {
    const existing = readJson<unknown>(snapshotFile);
    if (isCobraSourceInventorySnapshot(existing, index.runId)) return existing;
  } catch {
    // Missing, malformed, and partially-written snapshots are rebuilt below.
  }

  const mappingFile = mappingArtifactForRun(cobraRoot, index, associatedBuild);
  const snapshot: CobraSourceInventorySnapshot = {
    version: 1,
    runId: index.runId,
    capturedAt: new Date().toISOString(),
    mappingArtifact: normalizedArtifactPath(cobraRoot, mappingFile),
    inventory: buildCobraSourceInventory({ repoRoot, mappingFile }),
  };
  writeJsonAtomic(snapshotFile, snapshot);
  return snapshot;
}

function aggregateTestChunks(chunks: BrowserChunkCoverage[]): {
  coveredBytes: number;
  totalBytes: number;
  percentage: number | null;
} {
  const scripts = new Map<string, ScriptAggregate>();
  chunks.forEach((chunk, index) => {
    const url = typeof chunk.url === "string" && chunk.url ? chunk.url : `anonymous:${index}`;
    const totalBytes = nonNegativeNumber(chunk.totalBytes);
    const existing = scripts.get(url) ?? {
      url,
      script: chunk.script || url,
      totalBytes: 0,
      ranges: [],
      fallbackCoveredBytes: 0,
      testIds: new Set<string>(),
      hasCompleteRangeData: true,
    };
    existing.totalBytes = Math.max(existing.totalBytes, totalBytes);
    existing.fallbackCoveredBytes = Math.max(
      existing.fallbackCoveredBytes,
      Math.min(totalBytes, nonNegativeNumber(chunk.coveredBytes))
    );
    if (Array.isArray(chunk.coveredRanges)) existing.ranges.push(...chunk.coveredRanges);
    else existing.hasCompleteRangeData = false;
    scripts.set(url, existing);
  });

  let coveredBytes = 0;
  let totalBytes = 0;
  for (const script of scripts.values()) {
    const exactCovered = rangeBytes(mergeRanges(script.ranges, script.totalBytes));
    coveredBytes += script.hasCompleteRangeData
      ? exactCovered
      : Math.max(exactCovered, script.fallbackCoveredBytes);
    totalBytes += script.totalBytes;
  }
  return { coveredBytes, totalBytes, percentage: percentage(coveredBytes, totalBytes) };
}

function aggregateRuntime(
  index: RunIndex,
  documents: Map<string, PerTestCoverageDocument>,
  inventory: CobraSourceInventory,
  repoRoot: string
): RuntimeSummary {
  const scripts = new Map<string, ScriptAggregate>();
  const tests: TestSummary[] = [];
  const inventoryPaths = new Set(inventory.files.map((file) => file.path));

  for (const entry of index.tests) {
    const document = documents.get(entry.file);
    const chunks = Array.isArray(document?.browserChunks) ? document.browserChunks : [];
    const files = Array.isArray(document?.files) ? document.files : [];
    const testCoverage = aggregateTestChunks(chunks);
    const mappedPaths = new Set<string>();
    for (const file of files) {
      const repoPath = normalizeInventoryPath(file.path, repoRoot);
      if (repoPath && inventoryPaths.has(repoPath)) mappedPaths.add(repoPath);
    }

    tests.push({
      testId: entry.testId,
      specFile: entry.specFile || document?.specFile || "-",
      status: entry.status,
      durationMs: nonNegativeNumber(entry.durationMs || document?.durationMs),
      scriptCount: new Set(chunks.map((chunk) => chunk.url)).size,
      mappedSourceFileCount: mappedPaths.size,
      coveredBytes: testCoverage.coveredBytes,
      totalBytes: testCoverage.totalBytes,
      percentage: testCoverage.percentage,
    });

    chunks.forEach((chunk, chunkIndex) => {
      const url =
        typeof chunk.url === "string" && chunk.url
          ? chunk.url
          : `anonymous:${entry.testId}:${chunkIndex}`;
      const totalBytes = nonNegativeNumber(chunk.totalBytes);
      const aggregate = scripts.get(url) ?? {
        url,
        script: chunk.script || url,
        totalBytes: 0,
        ranges: [],
        fallbackCoveredBytes: 0,
        testIds: new Set<string>(),
        hasCompleteRangeData: true,
      };
      aggregate.totalBytes = Math.max(aggregate.totalBytes, totalBytes);
      aggregate.fallbackCoveredBytes = Math.max(
        aggregate.fallbackCoveredBytes,
        Math.min(totalBytes, nonNegativeNumber(chunk.coveredBytes))
      );
      aggregate.testIds.add(entry.testId);
      if (Array.isArray(chunk.coveredRanges)) aggregate.ranges.push(...chunk.coveredRanges);
      else aggregate.hasCompleteRangeData = false;
      scripts.set(url, aggregate);
    });
  }

  const scriptRows = Array.from(scripts.values())
    .map((script): ScriptRow => {
      const exactCovered = rangeBytes(mergeRanges(script.ranges, script.totalBytes));
      const coveredBytes = script.hasCompleteRangeData
        ? exactCovered
        : Math.max(exactCovered, script.fallbackCoveredBytes);
      return {
        ...script,
        coveredBytes,
        percentage: percentage(coveredBytes, script.totalBytes),
      };
    })
    .sort((left, right) => {
      const leftUncovered = left.totalBytes - left.coveredBytes;
      const rightUncovered = right.totalBytes - right.coveredBytes;
      return rightUncovered - leftUncovered || left.url.localeCompare(right.url);
    });

  const totalBytes = scriptRows.reduce((sum, script) => sum + script.totalBytes, 0);
  const coveredBytes = scriptRows.reduce((sum, script) => sum + script.coveredBytes, 0);
  return {
    scripts: scriptRows,
    tests,
    totalBytes,
    coveredBytes,
    percentage: percentage(coveredBytes, totalBytes),
    passed: tests.filter((test) => test.status.toLowerCase() === "passed").length,
    failed: tests.filter((test) => statusClass(test.status) === "failed").length,
    skipped: tests.filter((test) => test.status.toLowerCase() === "skipped").length,
    durationMs: tests.reduce((sum, test) => sum + test.durationMs, 0),
    incompleteRangeScripts: scriptRows.filter((script) => !script.hasCompleteRangeData)
      .length,
  };
}

function sourceCoverageRows(
  inventory: CobraSourceInventory,
  coverageAvailable: boolean
): string {
  return [...inventory.files]
    .sort(
      (left, right) =>
        (left.coveragePercent ?? Number.POSITIVE_INFINITY) -
          (right.coveragePercent ?? Number.POSITIVE_INFINITY) ||
        right.uncoveredLineCount - left.uncoveredLineCount ||
        left.path.localeCompare(right.path)
    )
    .map((file) => {
      const testSummary = !coverageAvailable
        ? `<span class="secondary">Not measured</span>`
        : file.mappedTests.length
        ? `<details><summary>${file.mappedTests.length} test${
            file.mappedTests.length === 1 ? "" : "s"
          }</summary><div class="detail-list">${file.mappedTests
            .map((test) => `<span>${escapeHtml(test)}</span>`)
            .join("")}</div></details>`
        : `<span class="secondary">No mapped test</span>`;
      const filterText = `${file.path} ${file.mappedTests.join(" ")}`.toLowerCase();
      return `
            <tr data-filter-row="${escapeHtml(filterText)}">
              <td><div class="primary code">${escapeHtml(file.path)}</div></td>
              <td>${progressBar(coverageAvailable ? file.coveragePercent : null)}</td>
              <td class="numeric">${
                coverageAvailable
                  ? `${formatCount(file.touchedLineCount)} / ${formatCount(file.totalLines)}`
                  : `N/A / ${formatCount(file.totalLines)}`
              }</td>
              <td class="numeric">${
                coverageAvailable ? formatCount(file.uncoveredLineCount) : "N/A"
              }</td>
              <td><div class="ranges code">${escapeHtml(
                coverageAvailable ? formatLineRanges(file.uncoveredRanges) : "Not measured"
              )}</div></td>
              <td>${testSummary}</td>
            </tr>`;
    })
    .join("");
}

function testRows(runtime: RuntimeSummary): string {
  return runtime.tests
    .map(
      (test) => `
            <tr data-filter-row="${escapeHtml(
              `${test.testId} ${test.specFile} ${test.status}`.toLowerCase()
            )}">
              <td><div class="primary">${escapeHtml(
                test.testId
              )}</div><div class="secondary">${escapeHtml(test.specFile)}</div></td>
              <td><span class="status ${statusClass(test.status)}"><i></i>${escapeHtml(
                test.status
              )}</span></td>
              <td>${progressBar(test.percentage)}</td>
              <td class="numeric">${escapeHtml(formatBytes(test.coveredBytes))} / ${escapeHtml(
                formatBytes(test.totalBytes)
              )}</td>
              <td class="numeric">${test.scriptCount}</td>
              <td class="numeric">${test.mappedSourceFileCount}</td>
              <td class="numeric">${escapeHtml(formatDuration(test.durationMs))}</td>
            </tr>`
    )
    .join("");
}

function chunkRows(runtime: RuntimeSummary): string {
  return runtime.scripts
    .map((script) => {
      const display = displayScript(script);
      return `
            <tr data-filter-row="${escapeHtml(
              `${display.title} ${display.detail} ${script.url}`.toLowerCase()
            )}">
              <td><div class="primary code">${escapeHtml(display.title)}</div>${
                display.detail
                  ? `<div class="secondary code">${escapeHtml(display.detail)}</div>`
                  : ""
              }</td>
              <td>${progressBar(script.percentage)}</td>
              <td class="numeric">${escapeHtml(formatBytes(script.coveredBytes))}</td>
              <td class="numeric">${escapeHtml(formatBytes(script.totalBytes))}</td>
              <td class="numeric">${script.testIds.size}</td>
            </tr>`;
    })
    .join("");
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    "mapped-change": "Changed code mapped to tests",
    "mapping-missing": "Baseline mapping is missing",
    "no-changes": "No application changes detected",
    "unmapped-change": "At least one changed file is unmapped",
  };
  return labels[reason] ?? reason.replace(/-/g, " ");
}

function renderAssociatedBuild(build: BuildRecord | undefined): string {
  if (!build) {
    return `
      <section class="panel" id="impact">
        <div class="panel-head"><div><p class="eyebrow">Git impact</p><h2>Associated analyzed change</h2><p class="panel-note">No valid build artifact is associated with this run id.</p></div></div>
        <div class="empty">This run still has a complete source and runtime snapshot. Git impact appears here only when a build id or build runId matches it.</div>
      </section>`;
  }

  const selection = build.selection ?? {
    mode: "unknown",
    reason: "unknown",
    changedFiles: [],
    recommendedTests: [],
    skippedTests: [],
    unmappedFiles: [],
  };
  const changedFiles = Array.isArray(selection.changedFiles) ? selection.changedFiles : [];
  const executedTests = Array.isArray(build.executedTests) ? build.executedTests : [];
  const selectedIds = Array.from(new Set(selection.recommendedTests ?? []));
  const matchedModules = build.matchedModules ?? [];
  const skippedIds = selection.skippedTests ?? [];
  const selectedTags = build.selectedTestTags ?? [];
  const selectedSpecs = build.selectedSpecFiles ?? [];
  const warnings = build.warnings ?? [];
  const expectedTestCount = build.expectedTestCount ?? selectedIds.length;
  const passedCount = executedTests.filter((test) => test.status === "passed").length;
  const failedCount = executedTests.filter((test) => test.status === "failed").length;
  const changedLineCount = changedFiles.reduce((total, file) => {
    const lines = new Set([...(file.lines ?? []), ...(file.oldLines ?? [])]);
    return total + lines.size;
  }, 0);
  const wholeFileChangeCount = changedFiles.filter(
    (file) => (file.lines?.length ?? 0) === 0 && (file.oldLines?.length ?? 0) === 0
  ).length;

  const changedRows = changedFiles
    .map((file) => {
      const lines = Array.isArray(file.lines)
        ? [...new Set(file.lines.filter((line) => Number.isInteger(line) && line > 0))].sort(
            (left, right) => left - right
          )
        : [];
      return `<div class="list-row"><div><div class="primary code">${escapeHtml(
        file.path
      )}</div><div class="secondary">${escapeHtml(file.status)} &middot; ${
        lines.length
          ? `${lines.length} changed line${lines.length === 1 ? "" : "s"} &middot; line${
              lines.length === 1 ? "" : "s"
            } ${escapeHtml(formatLineRanges(lines.map((line) => [line, line])))}`
          : "whole-file change"
      }</div></div></div>`;
    })
    .join("");

  const selectedRows = selectedIds
    .map((testId, index) => {
      const tag = selectedTags[index];
      return `<div class="list-row"><div><div class="primary">${escapeHtml(
        testId
      )}</div>${tag ? `<div class="secondary code">${escapeHtml(tag)}</div>` : ""}</div><span class="status queued"><i></i>selected</span></div>`;
    })
    .join("");

  const executedRows = executedTests
    .map(
      (test) =>
        `<div class="list-row"><div class="primary">${escapeHtml(
          test.testId
        )}</div><div class="test-result"><span class="status ${statusClass(
          test.status
        )}"><i></i>${escapeHtml(test.status)}</span><span class="secondary">${escapeHtml(
          formatDuration(test.durationMs)
        )}</span></div></div>`
    )
    .join("");

  const matchedModuleRows = matchedModules
    .map(
      (moduleId) =>
        `<div class="list-row"><div class="primary code">${escapeHtml(moduleId)}</div></div>`
    )
    .join("");

  const skippedRows = skippedIds
    .map(
      (testId) =>
        `<div class="list-row"><div class="primary">${escapeHtml(
          testId
        )}</div><span class="status skipped"><i></i>skipped</span></div>`
    )
    .join("");

  const executionLogEntries: Array<{ event: string; detail: string }> = [
    {
      event: "Run",
      detail: `${build.runId ?? build.id} · ${build.strategy ?? "unknown"} strategy`,
    },
    {
      event: "Selection",
      detail: `tags=${selectedTags.length ? selectedTags.join(", ") : "none"} · specs=${
        selectedSpecs.length ? selectedSpecs.join(", ") : "none"
      }`,
    },
    {
      event: "Execution",
      detail: `${expectedTestCount} expected · ${executedTests.length} executed · ${passedCount} passed · ${failedCount} failed`,
    },
    {
      event: "Timing",
      detail: `started=${
        build.startedAt ? formatDate(build.startedAt) : "not recorded"
      } · finished=${build.finishedAt ? formatDate(build.finishedAt) : "not recorded"}`,
    },
    ...warnings.map((warning) => ({ event: "Warning", detail: warning })),
  ];
  const executionLogRows = executionLogEntries
    .map(
      (entry) =>
        `<div class="list-row"><div><div class="primary">${escapeHtml(
          entry.event
        )}</div><div class="secondary code">${escapeHtml(entry.detail)}</div></div></div>`
    )
    .join("");

  return `
      <section class="panel" id="impact">
        <div class="panel-head">
          <div><p class="eyebrow">Git impact</p><h2>Associated analyzed change</h2><p class="panel-note">Commit ${escapeHtml(
            build.commitSha || "unknown"
          )} on ${escapeHtml(build.branch || "unknown")} &middot; received ${escapeHtml(
            formatDate(build.receivedAt)
          )}</p></div>
          <div class="head-badges"><span class="status ${statusClass(
            build.status
          )}"><i></i>${escapeHtml(build.status)}</span><span class="mode">${escapeHtml(
            selection.mode
          )}</span></div>
        </div>
        <div class="impact-summary">
          <div><span>Selection reason</span><strong>${escapeHtml(
            reasonLabel(selection.reason)
          )}</strong></div>
          <div><span>Changed files</span><strong>${changedFiles.length}</strong></div>
          <div><span>Changed lines</span><strong>${escapeHtml(
            wholeFileChangeCount
              ? `${changedLineCount} + ${wholeFileChangeCount} whole file${
                  wholeFileChangeCount === 1 ? "" : "s"
                }`
              : String(changedLineCount)
          )}</strong></div>
          <div><span>Matched modules</span><strong>${matchedModules.length}</strong></div>
          <div><span>Selected tests</span><strong>${selectedIds.length}</strong></div>
          <div><span>Skipped</span><strong>${skippedIds.length}</strong></div>
          <div><span>Duration</span><strong>${escapeHtml(
            build.durationMs == null ? "-" : formatDuration(build.durationMs)
          )}</strong></div>
        </div>
        <div class="split">
          <section><div class="subhead"><h3>Changed files</h3><span>${changedFiles.length}</span></div><div class="list">${
            changedRows || `<div class="empty compact">No changed files recorded.</div>`
          }</div></section>
          <section><div class="subhead"><h3>Matched modules</h3><span>${matchedModules.length}</span></div><div class="list">${
            matchedModuleRows || `<div class="empty compact">No module match recorded.</div>`
          }</div></section>
        </div>
        <div class="split">
          <section><div class="subhead"><h3>Selected module tests</h3><span>${selectedIds.length}</span></div><div class="list">${
            selectedRows || `<div class="empty compact">No tests selected for this change.</div>`
          }</div></section>
          <section><div class="subhead"><h3>Skipped tests</h3><span>${skippedIds.length}</span></div><div class="list">${
            skippedRows || `<div class="empty compact">No tests were skipped.</div>`
          }</div></section>
        </div>
        <div class="split">
          <section><div class="subhead"><h3>Executed results</h3><span>${executedTests.length}</span></div><div class="list">${
            executedRows || `<div class="empty compact">No executed results recorded.</div>`
          }</div></section>
          <section><div class="subhead"><h3>Structured execution log</h3><span>${executionLogEntries.length}</span></div><div class="list">${executionLogRows}</div></section>
        </div>
        ${
          (selection.unmappedFiles ?? []).length
            ? `<div class="warning"><strong>Unmapped change fallback:</strong> ${escapeHtml(
                selection.unmappedFiles.join(", ")
              )}</div>`
            : ""
        }
        ${build.error ? `<div class="error-box code">${escapeHtml(build.error)}</div>` : ""}
      </section>`;
}

function renderBuildHistory(builds: BuildRecord[]): string {
  const rows = builds
    .map(
      (build) => `
            <tr data-filter-row="${escapeHtml(
              `${build.commitSha} ${build.branch} ${build.status} ${build.selection?.reason ?? ""}`.toLowerCase()
            )}">
              <td><div class="primary code">${escapeHtml(
                (build.commitSha || "unknown").slice(0, 12)
              )}</div><div class="secondary">${escapeHtml(build.id)}</div></td>
              <td>${escapeHtml(build.branch || "unknown")}</td>
              <td><span class="status ${statusClass(build.status)}"><i></i>${escapeHtml(
                build.status
              )}</span></td>
              <td>${escapeHtml(build.selection?.mode ?? "-")}</td>
              <td>${escapeHtml(reasonLabel(build.selection?.reason ?? "unknown"))}</td>
              <td class="numeric">${build.selection?.changedFiles?.length ?? 0}</td>
              <td class="numeric">${build.executedTests?.length ?? 0}</td>
              <td class="numeric">${escapeHtml(
                build.durationMs == null ? "-" : formatDuration(build.durationMs)
              )}</td>
              <td class="numeric">${escapeHtml(formatDate(build.receivedAt))}</td>
            </tr>`
    )
    .join("");
  return `
      <section class="panel" id="builds">
        <div class="panel-head"><div><p class="eyebrow">History</p><h2>Analyzed builds</h2><p class="panel-note">Recent persisted Git and manual impact decisions.</p></div><input class="filter" type="search" placeholder="Filter builds" aria-label="Filter builds" data-filter-target="build-table"></div>
        <div class="table-wrap"><table id="build-table"><thead><tr><th>Commit / build</th><th>Branch</th><th>Status</th><th>Mode</th><th>Reason</th><th class="numeric">Changes</th><th class="numeric">Executed</th><th class="numeric">Duration</th><th class="numeric">Received</th></tr></thead><tbody>${
          rows || `<tr><td colspan="9" class="secondary">No build history is available.</td></tr>`
        }</tbody></table></div>
      </section>`;
}

function createHtml(
  index: RunIndex,
  documents: Map<string, PerTestCoverageDocument>,
  inventory: CobraSourceInventory,
  builds: BuildRecord[],
  repoRoot: string
): string {
  const runtime = aggregateRuntime(index, documents, inventory, repoRoot);
  const source = inventory.summary;
  const associatedBuild = associatedBuildForRun(index, builds);
  const history = recentBuilds(builds, associatedBuild);
  const sourceCoverageAvailable = inventory.mapping.ready;
  const moduleStrategy = associatedBuild?.strategy === "modules";
  const moduleSelectedCount = associatedBuild?.selection.recommendedTests.length ?? 0;
  const moduleSkippedCount = associatedBuild?.selection.skippedTests.length ?? 0;
  const moduleConfiguredCount = moduleSelectedCount + moduleSkippedCount;
  const mappingBanner = moduleStrategy && !sourceCoverageAvailable
    ? `<section class="banner warning-banner"><div class="banner-icon">!</div><div><strong>Module impact is available; source-line coverage was not collected</strong><p>${formatCount(
        associatedBuild?.matchedModules?.length ?? 0
      )} module(s) matched and ${formatCount(moduleSelectedCount)} of ${formatCount(
        moduleConfiguredCount
      )} tests were selected. Hosted repository source maps were unavailable, so source-line values are shown as N/A instead of false zeroes. Generated JavaScript coverage remains available below.</p></div></section>`
    : inventory.mapping.status === "invalid"
    ? `<section class="banner warning-banner"><div class="banner-icon">!</div><div><strong>Repository source mapping is invalid</strong><p>${escapeHtml(
        inventory.mapping.error ?? "The mapping artifact could not be read."
      )} Source metrics fail closed with no touched lines until the artifact is repaired.</p></div></section>`
    : inventory.mapping.status === "missing"
      ? `<section class="banner warning-banner"><div class="banner-icon">!</div><div><strong>Repository source mapping is missing</strong><p>No mapping artifact was available when this run snapshot was captured. Whole-source files remain visible with no touched lines.</p></div></section>`
      : inventory.mapping.ready && inventory.mapping.deploymentVerified
        ? `<section class="banner ready"><div class="banner-icon">&#10003;</div><div><strong>Repository source mapping is ready</strong><p>${formatCount(
            inventory.mapping.mappedFileCount
          )} application files and ${formatCount(
            source.mappedTests
          )} tests contribute to verified baseline ${escapeHtml(
            inventory.mapping.baselineRunId ?? "unknown"
          )}. Source percentages count nonblank, non-comment lines touched by at least one mapped test.</p></div></section>`
        : inventory.mapping.ready
          ? `<section class="banner warning-banner"><div class="banner-icon">!</div><div><strong>Source mapping is present but deployment-unverified</strong><p>${formatCount(
              inventory.mapping.mappedFileCount
            )} repository files have mapped touches, but baseline ${escapeHtml(
              inventory.mapping.baselineRunId ?? "unknown"
            )} was not verified against its deployed commit. Coverage is displayed, but this mapping is unsafe for selective-test decisions.</p></div></section>`
          : `<section class="banner warning-banner"><div class="banner-icon">!</div><div><strong>Repository source mapping has no application paths</strong><p>The latest mapping contains ${formatCount(
              inventory.mapping.testCount
            )} test record(s). ${formatCount(
              inventory.mapping.ignoredNonRepoFileCount
            )} hosted URL or non-application entries were excluded. Whole-source files remain visible with no touched lines until source maps or instrumented source coverage are available.</p></div></section>`;

  const provenance = `<section class="provenance" aria-label="Report artifact provenance">
      <div><span>Runtime snapshot</span><strong class="code">${escapeHtml(
        index.runId
      )}</strong><small>${escapeHtml(index.kind ?? "coverage")} &middot; ${escapeHtml(
        formatDate(index.createdAt)
      )}</small></div>
      <div><span>Source mapping</span><strong class="code">${escapeHtml(
        inventory.mapping.baselineRunId ?? inventory.mapping.status
      )}</strong><small>${escapeHtml(inventory.mapping.status)} &middot; ${escapeHtml(
        formatDate(inventory.mapping.updatedAt)
      )}</small></div>
      <div><span>Associated Git impact</span><strong class="code">${escapeHtml(
        associatedBuild?.commitSha.slice(0, 12) ?? "none"
      )}</strong><small>${escapeHtml(
        associatedBuild
          ? `${associatedBuild.branch} / ${associatedBuild.status}`
          : "No build matched this run"
      )}</small></div>
      <p>The whole-source inventory is fixed to this run. Git impact is joined only by matching build/run id; the history table can include other commits.</p>
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>COBRA Dashboard &middot; ${escapeHtml(index.runId)}</title>
  <style>
    :root{color-scheme:dark;--bg:#080b12;--surface:#111622;--surface2:#171d2b;--line:#273044;--text:#f3f6fb;--muted:#99a5bb;--purple:#9b87f5;--cyan:#45d6d0;--green:#4bd17f;--amber:#f4b860;--red:#ff7180;--blue:#66a3ff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 12% -8%,#34255f70 0,transparent 34rem),radial-gradient(circle at 98% 4%,#12475b55 0,transparent 30rem),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45}.shell{width:min(1500px,calc(100% - 40px));margin:0 auto;padding:44px 0 72px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:28px}.brand{display:flex;align-items:center;gap:11px;color:#dcd5ff;font-size:12px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}.logo{display:grid;place-items:center;width:34px;height:34px;border:1px solid #7567b8;border-radius:10px;background:#221d3b;box-shadow:0 0 30px #8d75ff38}h1{font-size:clamp(34px,5vw,60px);letter-spacing:-.055em;line-height:1.02;margin:22px 0 11px}.subtitle{color:var(--muted);font-size:15px;margin:0;max-width:760px}.run-meta{text-align:right;color:var(--muted);font-size:12px}.run-meta strong{display:block;color:var(--text);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;margin-bottom:5px}.nav{display:flex;flex-wrap:wrap;gap:8px;margin:25px 0}.nav a{color:#bec7d8;text-decoration:none;border:1px solid var(--line);background:#10141f;padding:7px 11px;border-radius:999px;font-size:11px;font-weight:750}.nav a:hover{color:white;border-color:#665a99}.provenance{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:#0d121b}.provenance div{min-width:0}.provenance span,.provenance small{display:block;color:var(--muted);font-size:10px}.provenance strong{display:block;margin:3px 0;font-size:12px}.provenance p{grid-column:1/-1;margin:1px 0 0;color:var(--amber);font-size:10px}.banner{display:flex;gap:14px;align-items:flex-start;padding:17px 19px;border:1px solid #3f765f;background:linear-gradient(105deg,#153527,#11202a);border-radius:14px;margin:18px 0}.banner.warning-banner{border-color:#745c32;background:linear-gradient(105deg,#352819,#1b1c26)}.banner-icon{display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:8px;background:#ffffff13;color:var(--cyan);font-weight:900}.warning-banner .banner-icon{color:var(--amber)}.banner strong{font-size:13px}.banner p{margin:3px 0 0;color:#bbc4d4;font-size:12px}.section-title{display:flex;justify-content:space-between;align-items:end;gap:20px;margin:31px 2px 13px}.section-title h2{font-size:22px;letter-spacing:-.025em;margin:0}.section-title p{margin:5px 0 0;color:var(--muted);font-size:12px;max-width:760px}.cards{display:grid;grid-template-columns:1.35fr repeat(4,1fr);gap:13px}.card{min-width:0;padding:19px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(150deg,#161c2a,#10141e);box-shadow:0 12px 34px #0003}.card.accent{background:linear-gradient(145deg,#29204d,#151b2c);border-color:#5b4e8c}.card-label{color:var(--muted);font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:850}.card-value{font-size:26px;line-height:1.1;letter-spacing:-.035em;font-weight:780;margin-top:9px;white-space:nowrap}.card.accent .card-value{font-size:37px;color:#ede9ff}.card-detail{font-size:11px;color:var(--muted);margin-top:7px}.panel{border:1px solid var(--line);border-radius:16px;background:#10141fdd;box-shadow:0 16px 44px #0003;overflow:hidden;margin-top:19px}.panel-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:20px 22px;border-bottom:1px solid var(--line)}.eyebrow{color:var(--purple);font-size:9px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;margin:0 0 4px}.panel h2{font-size:18px;letter-spacing:-.02em;margin:0}.panel-note{color:var(--muted);font-size:11px;margin:4px 0 0;max-width:760px}.filter{width:225px;border:1px solid #333c52;border-radius:9px;padding:9px 11px;background:#0b0f17;color:var(--text);outline:none}.filter:focus{border-color:var(--purple);box-shadow:0 0 0 3px #9b87f521}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}th{padding:11px 14px;color:#8f99ae;font-size:9px;letter-spacing:.08em;text-transform:uppercase;text-align:left;background:#0c1018;white-space:nowrap}td{padding:13px 14px;border-top:1px solid #202738;vertical-align:middle}tbody tr:hover{background:#161c29}.primary{font-weight:650;max-width:720px}.secondary{color:var(--muted);font-size:10px;margin-top:3px;max-width:720px;overflow-wrap:anywhere}.code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.numeric{text-align:right;white-space:nowrap}.ranges{color:#bbc4d5;font-size:10px;min-width:150px;max-width:290px}.status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:780;text-transform:capitalize;white-space:nowrap}.status i{width:6px;height:6px;border-radius:50%;background:currentColor}.status.passed{color:#6be49a;background:#163a26}.status.failed{color:#ff8b97;background:#3d1a21}.status.skipped{color:#f7c778;background:#3b2d19}.status.running{color:#80b4ff;background:#172c4b}.status.queued,.status.planned{color:#cabdff;background:#292343}.mode{display:inline-flex;border:1px solid #50466e;border-radius:999px;padding:4px 8px;color:#cabfff;font-size:10px;font-weight:800}.coverage-cell{display:grid;grid-template-columns:47px minmax(58px,105px);gap:9px;align-items:center;justify-content:end}.coverage-cell strong{text-align:right;font-size:11px}.bar{height:5px;background:#2b3243;border-radius:10px;overflow:hidden}.bar span{display:block;height:100%;border-radius:inherit}.bar .good{background:var(--green)}.bar .medium{background:var(--amber)}.bar .low{background:var(--red)}.bar .unknown{background:#687086}details summary{cursor:pointer;color:#cdd5e4;font-size:11px;white-space:nowrap}.detail-list{display:grid;gap:5px;min-width:260px;max-width:460px;margin-top:8px;padding:9px;border:1px solid var(--line);border-radius:8px;background:#0b0f17}.detail-list span{color:var(--muted);font-size:10px;overflow-wrap:anywhere}.head-badges{display:flex;align-items:center;gap:8px}.impact-summary{display:grid;grid-template-columns:2fr repeat(4,1fr);border-bottom:1px solid var(--line)}.impact-summary>div{padding:15px 18px;border-right:1px solid var(--line)}.impact-summary>div:last-child{border-right:0}.impact-summary span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.impact-summary strong{display:block;margin-top:5px;font-size:13px}.split{display:grid;grid-template-columns:1fr 1fr}.split>section+section{border-left:1px solid var(--line)}.subhead{display:flex;justify-content:space-between;padding:14px 18px;background:#0d111a;border-bottom:1px solid var(--line)}.subhead h3{font-size:12px;margin:0}.subhead span{color:var(--muted);font-size:10px}.list{max-height:310px;overflow:auto}.list-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 18px;border-top:1px solid #202738}.list-row:first-child{border-top:0}.test-result{display:flex;align-items:center;gap:8px}.warning,.error-box{margin:14px 18px;padding:11px 13px;border-radius:9px;font-size:11px}.warning{border:1px solid #725c34;background:#2b2318;color:#f2ca83}.error-box{border:1px solid #74323c;background:#30171d;color:#ff9ca6;white-space:pre-wrap}.empty{padding:36px 22px;text-align:center;color:var(--muted);font-size:12px}.empty.compact{padding:25px 18px}.note{margin-top:14px;padding:14px 16px;border:1px dashed #364056;border-radius:12px;background:#0d121b;color:var(--muted);font-size:11px}.footer{display:flex;justify-content:space-between;color:#747e92;font-size:10px;margin-top:22px;padding:0 4px}.hidden-row{display:none}@media(max-width:1100px){.cards{grid-template-columns:repeat(3,1fr)}.card.accent{grid-column:span 2}.impact-summary{grid-template-columns:repeat(3,1fr)}.impact-summary>div{border-bottom:1px solid var(--line)}}@media(max-width:760px){.shell{width:min(100% - 24px,1500px);padding-top:27px}.top{display:block}.run-meta{text-align:left;margin-top:17px}.cards{grid-template-columns:1fr 1fr}.card.accent{grid-column:span 2}.panel-head,.section-title{display:block}.filter{width:100%;margin-top:13px}.provenance{grid-template-columns:1fr}.provenance p{grid-column:auto}.split{grid-template-columns:1fr}.split>section+section{border-left:0;border-top:1px solid var(--line)}.impact-summary{grid-template-columns:1fr 1fr}.footer{display:block}.footer span{display:block;margin-top:5px}}@media(max-width:460px){.cards{grid-template-columns:1fr}.card.accent{grid-column:auto}.coverage-cell{grid-template-columns:42px 58px}.impact-summary{grid-template-columns:1fr}}
    @media(min-width:1101px){.impact-summary{grid-template-columns:2fr repeat(6,1fr)}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="top">
      <div><div class="brand"><span class="logo">C</span>COBRA</div><h1>Application assurance</h1><p class="subtitle">Whole-repository source visibility, deployed browser execution, Git change impact, and selected test results in one standalone report.</p></div>
      <div class="run-meta"><strong>${escapeHtml(index.runId)}</strong><span>${escapeHtml(
        formatDate(index.createdAt)
      )} &rarr; ${escapeHtml(formatDate(index.finishedAt))}</span>${
        index.targetUrl
          ? `<div class="secondary code">${escapeHtml(index.targetUrl)}</div>`
          : ""
      }</div>
    </header>
    <nav class="nav"><a href="#impact">Git impact</a><a href="#source">Source coverage</a><a href="#runtime">Loaded JavaScript</a><a href="#tests">Tests</a><a href="#builds">Build history</a></nav>

    ${provenance}
    ${mappingBanner}

    ${renderAssociatedBuild(associatedBuild)}

    <div class="section-title" id="source"><div><h2>Repository source-line coverage</h2><p>Inventory of TS, TSX, JS, and JSX under ${escapeHtml(
      inventory.roots.join(", ")
    )}. Every eligible file is included, including files with no mapped execution.</p></div></div>
    <section class="cards">
      <article class="card accent"><div class="card-label">Source-line coverage</div><div class="card-value">${escapeHtml(
        sourceCoverageAvailable ? formatPercentage(source.coveragePercent) : "N/A"
      )}</div><div class="card-detail">${
        sourceCoverageAvailable
          ? `${formatCount(source.touchedLines)} of ${formatCount(source.totalLines)} eligible lines executed`
          : "Not collected; repository source maps unavailable"
      }</div></article>
      <article class="card"><div class="card-label">Application files</div><div class="card-value">${formatCount(
        source.totalFiles
      )}</div><div class="card-detail">${
        sourceCoverageAvailable
          ? `${formatCount(source.coveredFiles)} touched &middot; ${formatCount(
              source.uncoveredFiles
            )} at 0% &middot; ${formatCount(source.notApplicableFiles)} N/A`
          : "Source inventory only; execution is not measured"
      }</div></article>
      <article class="card"><div class="card-label">Uncovered source lines</div><div class="card-value">${
        sourceCoverageAvailable ? formatCount(source.uncoveredLines) : "N/A"
      }</div><div class="card-detail">${
        sourceCoverageAvailable
          ? "Nonblank, non-comment source lines"
          : "Cannot be calculated without source maps"
      }</div></article>
      <article class="card"><div class="card-label">${
        moduleStrategy ? "Module test selection" : "Source-mapped tests"
      }</div><div class="card-value">${
        moduleStrategy
          ? `${formatCount(moduleSelectedCount)} / ${formatCount(moduleConfiguredCount)}`
          : sourceCoverageAvailable
            ? formatCount(source.mappedTests)
            : "N/A"
      }</div><div class="card-detail">${
        moduleStrategy
          ? `${formatCount(moduleSelectedCount)} selected &middot; ${formatCount(
              moduleSkippedCount
            )} skipped`
          : sourceCoverageAvailable
            ? "Tests with repository source paths"
            : "Not collected"
      }</div></article>
      <article class="card"><div class="card-label">Source-map state</div><div class="card-value">${
        !sourceCoverageAvailable
          ? "Unavailable"
          : inventory.mapping.status === "invalid"
          ? "Invalid"
          : inventory.mapping.status === "missing"
            ? "Missing"
            : inventory.mapping.ready && !inventory.mapping.deploymentVerified
              ? "Unverified"
              : inventory.mapping.ready
                ? "Ready"
                : "Unmapped"
      }</div><div class="card-detail">${
        sourceCoverageAvailable
          ? `${formatCount(inventory.mapping.ignoredNonRepoFileCount)} generated/non-repo entries ignored`
          : "Generated JavaScript coverage is reported separately"
      }</div></article>
    </section>

    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">Repository inventory</p><h2>${
        sourceCoverageAvailable ? "Covered and uncovered source" : "Source files — coverage not collected"
      }</h2><p class="panel-note">${
        sourceCoverageAvailable
          ? "This is source-line touch coverage, not statement or branch instrumentation. It deliberately excludes hosted URLs and generated chunks from repository metrics."
          : "The files are inventoried, but touched lines, uncovered lines, and source-mapped tests are N/A because this run had no usable repository source maps."
      }</p></div><input class="filter" type="search" placeholder="Filter source or test" aria-label="Filter source files" data-filter-target="source-table"></div>
      <div class="table-wrap"><table id="source-table"><thead><tr><th>Source file</th><th class="numeric">Coverage</th><th class="numeric">Executed / eligible</th><th class="numeric">Uncovered</th><th>Uncovered line ranges</th><th>Source-mapped tests</th></tr></thead><tbody>${
        sourceCoverageRows(inventory, sourceCoverageAvailable) ||
        `<tr><td colspan="6" class="secondary">No eligible application source files were found.</td></tr>`
      }</tbody></table></div>
    </section>

    <div class="section-title" id="runtime"><div><h2>Loaded generated JavaScript</h2><p>Chromium V8 generated-script range coverage for same-origin scripts loaded during this run. This is separate from whole-source coverage: unloaded routes are absent and bundles can contain framework or vendor code.</p></div></div>
    <section class="cards">
      <article class="card accent"><div class="card-label">Loaded JS coverage</div><div class="card-value">${escapeHtml(
        formatPercentage(runtime.percentage)
      )}</div><div class="card-detail">${escapeHtml(
        formatBytes(runtime.coveredBytes)
      )} of ${escapeHtml(formatBytes(runtime.totalBytes))} loaded JavaScript</div></article>
      <article class="card"><div class="card-label">Tests</div><div class="card-value">${runtime.tests.length}</div><div class="card-detail">${runtime.passed} passed &middot; ${runtime.failed} failed &middot; ${runtime.skipped} skipped</div></article>
      <article class="card"><div class="card-label">Loaded chunks</div><div class="card-value">${runtime.scripts.length}</div><div class="card-detail">Unique same-origin script URLs</div></article>
      <article class="card"><div class="card-label">Repo source matches</div><div class="card-value">${formatCount(
        inventory.mapping.mappedFileCount
      )}</div><div class="card-detail">From this run's mapping snapshot</div></article>
      <article class="card"><div class="card-label">Test time</div><div class="card-value">${escapeHtml(
        formatDuration(runtime.durationMs)
      )}</div><div class="card-detail">Combined test duration</div></article>
    </section>
    <div class="note">Hosted chunk URLs are shown only in the generated-JavaScript tables below. They are never counted as repository source files.${
      runtime.incompleteRangeScripts
        ? ` ${runtime.incompleteRangeScripts} script(s) lacked interval data and use the best available executed-size count.`
        : ""
    }</div>

    <section class="panel" id="tests">
      <div class="panel-head"><div><p class="eyebrow">Runtime tests</p><h2>Per-test loaded JavaScript</h2><p class="panel-note">Each percentage is calculated independently from scripts observed by that test.</p></div><input class="filter" type="search" placeholder="Filter tests" aria-label="Filter tests" data-filter-target="test-table"></div>
      <div class="table-wrap"><table id="test-table"><thead><tr><th>Test</th><th>Status</th><th class="numeric">Loaded JS</th><th class="numeric">Executed size</th><th class="numeric">Scripts</th><th class="numeric">Repo files</th><th class="numeric">Duration</th></tr></thead><tbody>${
        testRows(runtime) ||
        `<tr><td colspan="7" class="secondary">No test documents were recorded for this run.</td></tr>`
      }</tbody></table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">Deployment assets</p><h2>Observed JavaScript chunks</h2><p class="panel-note">Executed V8 ranges are unioned by URL across tests so duplicate execution is counted once.</p></div><input class="filter" type="search" placeholder="Filter scripts" aria-label="Filter scripts" data-filter-target="chunk-table"></div>
      <div class="table-wrap"><table id="chunk-table"><thead><tr><th>Generated script / URL</th><th class="numeric">Coverage</th><th class="numeric">Executed</th><th class="numeric">Loaded size</th><th class="numeric">Tests</th></tr></thead><tbody>${
        chunkRows(runtime) ||
        `<tr><td colspan="5" class="secondary">No browser script coverage was recorded for this run.</td></tr>`
      }</tbody></table></div>
    </section>

    ${renderBuildHistory(history)}
    <footer class="footer"><span>Generated from local COBRA run, mapping, build, and repository artifacts</span><span>${escapeHtml(
      index.kind || "coverage"
    )} run &middot; ${escapeHtml(index.coverageMode || "unknown mode")}</span></footer>
  </main>
  <script>
    document.querySelectorAll('[data-filter-target]').forEach(function(input){
      input.addEventListener('input',function(){
        var query=input.value.trim().toLowerCase();
        var table=document.getElementById(input.getAttribute('data-filter-target'));
        if(!table)return;
        table.querySelectorAll('tbody [data-filter-row]').forEach(function(row){
          row.classList.toggle('hidden-row',Boolean(query)&&!row.getAttribute('data-filter-row').includes(query));
        });
      });
    });
  </script>
</body>
</html>`;
}

/**
 * Captures `runs/<runId>/source-inventory.json`, writes both the immutable
 * `.cobra/dashboard/<runId>.html` view and the convenience `index.html`, and
 * returns the absolute index path.
 */
export function generateCoverageDashboard(
  runId: string,
  options: CoverageDashboardOptions = {}
): string {
  const normalizedRunId = safeRunId(runId);
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const cobraRoot = path.resolve(options.cobraRoot ?? getCobraRoot(repoRoot));
  const runDirectory = path.join(cobraRoot, "runs", normalizedRunId);
  const indexFile = path.join(runDirectory, "index.json");
  if (!fs.existsSync(indexFile)) {
    throw new Error(`Coverage run not found: ${normalizedRunId}`);
  }

  let candidateIndex: unknown;
  try {
    candidateIndex = readJson<unknown>(indexFile);
  } catch {
    throw new Error(`Invalid coverage index for run: ${normalizedRunId}`);
  }
  if (!isRunIndex(candidateIndex, normalizedRunId)) {
    throw new Error(`Invalid coverage index for run: ${normalizedRunId}`);
  }
  const index = candidateIndex;

  const documents = new Map<string, PerTestCoverageDocument>();
  for (const entry of index.tests) {
    if (!entry || typeof entry.file !== "string") continue;
    const document = loadDocument(runDirectory, entry.file);
    if (document) documents.set(entry.file, document);
  }

  const builds = loadBuilds(cobraRoot).map((build) =>
    hydrateBuildEvidence(cobraRoot, build)
  );
  const associatedBuild = associatedBuildForRun(index, builds);
  const snapshot = sourceInventoryForRun(
    cobraRoot,
    repoRoot,
    runDirectory,
    index,
    associatedBuild
  );
  const dashboardDirectory = path.join(cobraRoot, "dashboard");
  const runOutputFile = path.resolve(dashboardDirectory, `${normalizedRunId}.html`);
  const indexOutputFile = path.resolve(dashboardDirectory, "index.html");
  const html = createHtml(index, documents, snapshot.inventory, builds, repoRoot);
  writeTextAtomic(runOutputFile, html);
  writeTextAtomic(indexOutputFile, html);
  return indexOutputFile;
}
