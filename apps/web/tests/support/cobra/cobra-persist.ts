/** File-backed COBRA run storage with transactional baseline publication. */
import fs from "node:fs";
import path from "node:path";
import {
  hasUsableCobraRepositorySourceLines,
  isCompleteHostedBrowserSourceMaps,
  isCobraRepositorySourcePath,
  isTrustedCobraMapping,
} from "@interview/shared";
import type {
  CobraMappingIndex,
  CobraMappingTest,
  CobraTestStatus,
  PerTestCoverage,
  RunIndex,
} from "./cobra-shape.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const COBRA_ROOT = process.env.COBRA_STORAGE_DIR
  ? path.resolve(process.env.COBRA_STORAGE_DIR)
  : path.join(REPO_ROOT, ".cobra");
const MAPPINGS_DIR = path.join(COBRA_ROOT, "mappings");
const MAPPING_FILE = path.join(MAPPINGS_DIR, "latest.json");
const TRUSTED_MAPPING_FILE = path.join(MAPPINGS_DIR, "trusted.json");

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid COBRA path segment: ${value}`);
  }
  return value;
}

function runDir(runId: string): string {
  return path.join(COBRA_ROOT, "runs", safeSegment(runId));
}

function indexPath(runId: string): string {
  return path.join(runDir(runId), "index.json");
}

function ensureDir(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

function writeJsonAtomic(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sanitizeForFilename(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9\-_. ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

export function initRun(
  runId: string,
  kind: "baseline" | "impact" | "adhoc" = "adhoc",
  metadata: Pick<
    RunIndex,
    | "coverageMode"
    | "targetUrl"
    | "commitSha"
    | "deploymentVerified"
    | "expectedTestCount"
  > = {}
): void {
  ensureDir(runDir(runId));
  const index: RunIndex = {
    runId,
    kind,
    ...metadata,
    status: "running",
    createdAt: new Date().toISOString(),
    tests: [],
  };
  if (!fs.existsSync(indexPath(runId))) {
    writeJsonAtomic(indexPath(runId), index);
  }
}

export function finalizeRun(runId: string): void {
  const file = indexPath(runId);
  const index = readJson<RunIndex>(file);
  if (!index) return;

  index.finishedAt = new Date().toISOString();
  const unhealthy = index.tests.some((test) => test.status !== "passed");
  const expectedCount = index.expectedTestCount;
  const countIsComplete =
    typeof expectedCount === "number" &&
    expectedCount > 0 &&
    index.tests.length === expectedCount;
  index.status = unhealthy ? "failed" : "passed";

  if (typeof expectedCount === "number" && !countIsComplete) {
    index.status = "failed";
  }
  writeJsonAtomic(file, index);

  if (index.kind !== "baseline") return;
  if (index.status !== "passed") {
    throw new Error(
      `[cobra] baseline ${runId} was not promoted: recorded ${index.tests.length} of ` +
        `${expectedCount ?? "unknown"} expected tests or a test did not pass`
    );
  }

  try {
    promoteBaseline(index);
  } catch (error) {
    // A run must never remain eligible for a later manual refresh when its
    // publication validation failed (for example, a missing per-test file).
    index.status = "failed";
    writeJsonAtomic(file, index);
    throw error;
  }
}

function promoteBaseline(index: RunIndex): void {
  const documents: Array<{
    document: PerTestCoverage;
    status: CobraTestStatus;
  }> = [];

  for (const entry of index.tests) {
    const document = readJson<PerTestCoverage>(
      path.join(runDir(index.runId), path.basename(entry.file))
    );
    if (!document) {
      throw new Error(
        `[cobra] baseline ${index.runId} is missing ${entry.file}; previous mapping retained`
      );
    }
    if (document.runId !== index.runId) {
      throw new Error(
        `[cobra] baseline ${index.runId} contains a document for run ${document.runId}; previous mapping retained`
      );
    }
    if (
      document.testId !== entry.testId ||
      (entry.stableTestId && document.stableTestId !== entry.stableTestId)
    ) {
      throw new Error(
        `[cobra] baseline ${index.runId} contains mismatched test metadata for ${entry.file}; previous mapping retained`
      );
    }
    documents.push({ document, status: entry.status });
  }

  const now = new Date().toISOString();
  const tests: CobraMappingTest[] = documents.map(({ document, status }) => ({
    testId: document.testId,
    stableTestId: document.stableTestId,
    titlePath: document.titlePath,
    projectName: document.projectName,
    specFile: document.specFile,
    sourceRunId: index.runId,
    updatedAt: now,
    status,
    files: document.files,
    externalDeps: document.externalDeps,
    browserSourceMaps: document.browserSourceMaps,
  }));

  const paths = tests.flatMap((test) => test.files.map((file) => file.path));
  const sourceCount = paths.filter(isCobraRepositorySourcePath).length;
  const hasCompleteHostedSourceCoverage = tests.every(
    (test) =>
      test.status === "passed" &&
      hasUsableCobraRepositorySourceLines(test) &&
      isCompleteHostedBrowserSourceMaps(test.browserSourceMaps)
  );
  const coverageCapability: CobraMappingIndex["coverageCapability"] =
    sourceCount === 0
      ? "generated-only"
      : hasCompleteHostedSourceCoverage
        ? "source"
        : "mixed";

  const mapping: CobraMappingIndex = {
    version: 1,
    baselineRunId: index.runId,
    baselineCommitSha: index.commitSha,
    deploymentVerified: index.deploymentVerified,
    coverageCapability,
    createdAt: now,
    updatedAt: now,
    tests: tests.sort((a, b) => a.testId.localeCompare(b.testId)),
  };
  // Keep immutable provenance for historical reports, always expose the most
  // recent baseline for diagnostics, and advance the selective pointer only
  // when identity and complete repository-source coverage are trustworthy.
  writeJsonAtomic(path.join(MAPPINGS_DIR, `${safeSegment(index.runId)}.json`), mapping);
  writeJsonAtomic(MAPPING_FILE, mapping);
  if (isTrustedCobraMapping(mapping)) {
    writeJsonAtomic(TRUSTED_MAPPING_FILE, mapping);
  }
}

export function writePerTest(
  runId: string,
  document: PerTestCoverage,
  status: CobraTestStatus
): string {
  ensureDir(runDir(runId));
  const filename = `${sanitizeForFilename(
    document.stableTestId ?? document.testId
  )}.json`;
  const fullPath = path.join(runDir(runId), filename);
  writeJsonAtomic(fullPath, document);

  const indexFile = indexPath(runId);
  const index = readJson<RunIndex>(indexFile) ?? {
    runId,
    kind: "adhoc",
    status: "running",
    createdAt: new Date().toISOString(),
    tests: [],
  };
  const browserChunks = document.browserChunks ?? [];
  const entry = {
    testId: document.testId,
    stableTestId: document.stableTestId,
    titlePath: document.titlePath,
    projectName: document.projectName,
    file: filename,
    specFile: document.specFile,
    startedAt: document.startedAt,
    durationMs: document.durationMs,
    fileCount: document.files.length,
    externalDepCount: document.externalDeps.length,
    browserChunkCount: browserChunks.length,
    coveredBytes: browserChunks.reduce(
      (sum, chunk) => sum + chunk.coveredBytes,
      0
    ),
    totalBytes: browserChunks.reduce(
      (sum, chunk) => sum + chunk.totalBytes,
      0
    ),
    browserSourceMaps: document.browserSourceMaps,
    status,
  };
  const existing = index.tests.findIndex((test) =>
    document.stableTestId
      ? test.stableTestId === document.stableTestId
      : test.testId === document.testId
  );
  if (existing === -1) index.tests.push(entry);
  else index.tests[existing] = entry;

  writeJsonAtomic(indexFile, index);
  return fullPath;
}
