export type CobraTestStatus =
  | "passed"
  | "failed"
  | "timedOut"
  | "skipped"
  | "interrupted";

export type ExternalDep = {
  kind: "prisma";
  model: string | null;
  operation: string;
};

export type FileCoverage = {
  path: string;
  functionsTouched: string[];
  linesTouched: number[];
};

/**
 * Generated browser script coverage captured by Chromium. Ranges are retained
 * so the dashboard can union coverage from several tests without double
 * counting bytes that were executed more than once.
 */
export type BrowserChunkCoverage = {
  url: string;
  script: string;
  totalBytes: number;
  coveredBytes: number;
  coveragePercent: number;
  coveredRanges: Array<[number, number]>;
};

/**
 * Provenance for browser source-map resolution during one test. Only loaded
 * JavaScript chunk URLs are counted; inline document scripts are excluded.
 */
export type BrowserSourceMapDiagnostics = {
  totalScripts: number;
  resolvedHostedMaps: number;
  resolvedLocalExactMaps: number;
  unresolvedMaps: number;
};

export type PerTestCoverage = {
  testId: string;
  /** Playwright's stable ID; display titles must never be used for selection. */
  stableTestId?: string;
  titlePath?: string[];
  projectName?: string;
  runId: string;
  specFile?: string;
  startedAt: string;
  durationMs: number;
  files: FileCoverage[];
  externalDeps: ExternalDep[];
  browserChunks?: BrowserChunkCoverage[];
  browserSourceMaps?: BrowserSourceMapDiagnostics;
};

export type RunIndexEntry = {
  testId: string;
  stableTestId?: string;
  titlePath?: string[];
  projectName?: string;
  file: string;
  specFile?: string;
  startedAt: string;
  durationMs: number;
  fileCount: number;
  externalDepCount: number;
  browserChunkCount?: number;
  coveredBytes?: number;
  totalBytes?: number;
  browserSourceMaps?: BrowserSourceMapDiagnostics;
  status: CobraTestStatus;
};

export type RunIndex = {
  runId: string;
  kind?: "baseline" | "impact" | "adhoc";
  coverageMode?: "full-stack" | "hosted-browser";
  targetUrl?: string;
  commitSha?: string;
  deploymentVerified?: boolean;
  expectedTestCount?: number;
  status?: "running" | "passed" | "failed";
  createdAt: string;
  finishedAt?: string;
  tests: RunIndexEntry[];
};

export type CobraMappingTest = {
  testId: string;
  stableTestId?: string;
  titlePath?: string[];
  projectName?: string;
  specFile?: string;
  sourceRunId: string;
  updatedAt: string;
  status: CobraTestStatus;
  files: FileCoverage[];
  externalDeps: ExternalDep[];
  browserSourceMaps?: BrowserSourceMapDiagnostics;
};

export type CobraMappingIndex = {
  version: 1;
  baselineRunId: string;
  baselineCommitSha?: string;
  deploymentVerified?: boolean;
  coverageCapability?: "source" | "generated-only" | "mixed";
  createdAt: string;
  updatedAt: string;
  tests: CobraMappingTest[];
};

export type CobraChangedFile = {
  path: string;
  /** Previous path for a rename. */
  oldPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  /** Empty means the entire file changed or the webhook supplied no hunks. */
  lines: number[];
  /** Old-side hunk lines, used for deletions and rename safety decisions. */
  oldLines?: number[];
  /**
   * True when at least one Git hunk adds/removes lines or the file type/mode
   * changed. A baseline line map cannot safely select tests for this change.
   */
  structuralChange?: boolean;
};

export type CobraImpactDecision = {
  mode: "impacted" | "full-regression";
  reason:
    | "mapped-change"
    | "mapping-missing"
    | "unmapped-change"
    | "no-changes";
  changedFiles: CobraChangedFile[];
  recommendedTests: string[];
  skippedTests: string[];
  unmappedFiles: string[];
};

export type CobraExecutedTest = {
  testId: string;
  status: CobraTestStatus;
  durationMs: number;
};

export type CobraBuildStatus =
  | "planned"
  | "queued"
  | "running"
  | "passed"
  | "failed";

export type CobraBuild = {
  id: string;
  /** Immutable baseline mapping used to make this selection decision. */
  baselineRunId?: string;
  baseSha?: string;
  headSha?: string;
  commitSha: string;
  branch: string;
  source: "webhook" | "manual";
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
  status: CobraBuildStatus;
  runId?: string;
  selection: CobraImpactDecision;
  executedTests: CobraExecutedTest[];
  error?: string;
};

export type CobraDashboard = {
  enabled: boolean;
  mapping: {
    ready: boolean;
    baselineRunId?: string;
    baselineCommitSha?: string;
    deploymentVerified?: boolean;
    coverageCapability?: "source" | "generated-only" | "mixed";
    updatedAt?: string;
    testCount: number;
    fileCount: number;
    generatedFileCount?: number;
  };
  builds: CobraBuild[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True only for application/package source files that can participate in impact analysis. */
export function isCobraRepositorySourcePath(value: unknown): value is string {
  if (typeof value !== "string" || /^https?:\/\//i.test(value)) return false;
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  return (
    segments.length >= 4 &&
    (segments[0] === "apps" || segments[0] === "packages") &&
    segments[1].length > 0 &&
    segments[2] === "src" &&
    segments.slice(3).every((segment) =>
      segment.length > 0 && segment !== "." && segment !== ".."
    )
  );
}

/**
 * Hosted source maps are the only source-line evidence trusted for selective
 * skipping. Local exact-match maps remain useful diagnostics, but cannot
 * prove what a remote deployment served.
 */
export function isCompleteHostedBrowserSourceMaps(
  value: unknown
): value is BrowserSourceMapDiagnostics {
  if (!isRecord(value)) return false;
  const counts = [
    value.totalScripts,
    value.resolvedHostedMaps,
    value.resolvedLocalExactMaps,
    value.unresolvedMaps,
  ];
  if (
    !counts.every(
      (count) => Number.isInteger(count) && (count as number) >= 0
    )
  ) {
    return false;
  }

  const totalScripts = value.totalScripts as number;
  return (
    totalScripts > 0 &&
    value.resolvedHostedMaps === totalScripts &&
    value.resolvedLocalExactMaps === 0 &&
    value.unresolvedMaps === 0
  );
}

/** A source mapping test must have at least one concrete repository line. */
export function hasUsableCobraRepositorySourceLines(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.files) || value.files.length === 0) {
    return false;
  }

  let touchedRepositoryLine = false;
  for (const file of value.files) {
    if (
      !isRecord(file) ||
      !isCobraRepositorySourcePath(file.path) ||
      !Array.isArray(file.linesTouched) ||
      !file.linesTouched.every(
        (line) => Number.isInteger(line) && (line as number) > 0
      )
    ) {
      return false;
    }
    if (file.linesTouched.length > 0) touchedRepositoryLine = true;
  }
  return touchedRepositoryLine;
}

/** Runtime guard for evidence that is safe to use for selective test skipping. */
export function isTrustedCobraMapping(
  value: unknown
): value is CobraMappingIndex {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.baselineRunId !== "string" ||
    value.baselineRunId.length === 0 ||
    value.deploymentVerified !== true ||
    value.coverageCapability !== "source" ||
    !Array.isArray(value.tests) ||
    value.tests.length === 0
  ) {
    return false;
  }

  return value.tests.every(
    (test) =>
      isRecord(test) &&
      typeof test.testId === "string" &&
      test.testId.length > 0 &&
      test.sourceRunId === value.baselineRunId &&
      test.status === "passed" &&
      hasUsableCobraRepositorySourceLines(test) &&
      isCompleteHostedBrowserSourceMaps(test.browserSourceMaps)
  );
}
