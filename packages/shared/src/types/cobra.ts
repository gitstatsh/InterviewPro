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
