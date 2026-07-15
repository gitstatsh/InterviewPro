import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CobraBuild,
  CobraMappingIndex,
  CobraMappingTest,
  PerTestCoverage,
  RunIndex,
} from "@interview/shared";
import {
  hasUsableCobraRepositorySourceLines,
  isCompleteHostedBrowserSourceMaps,
  isCobraRepositorySourcePath,
  isTrustedCobraMapping,
} from "@interview/shared";
import { env } from "../../config/env.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function findWorkspaceRoot(start: string): string | null {
  let current = path.resolve(start);
  while (true) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) &&
      fs.existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export const REPO_ROOT =
  findWorkspaceRoot(MODULE_DIR) ??
  findWorkspaceRoot(process.cwd()) ??
  path.resolve(process.cwd());
const COBRA_ROOT = env.COBRA_STORAGE_DIR
  ? path.resolve(env.COBRA_STORAGE_DIR)
  : path.join(REPO_ROOT, ".cobra");
const MAPPINGS_DIR = path.join(COBRA_ROOT, "mappings");
const MAPPING_FILE = path.join(MAPPINGS_DIR, "latest.json");
const TRUSTED_MAPPING_FILE = path.join(MAPPINGS_DIR, "trusted.json");
const BUILDS_DIR = path.join(COBRA_ROOT, "builds");
const RUNS_DIR = path.join(COBRA_ROOT, "runs");

function safeId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error("Invalid COBRA id");
  return value;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

export function readMapping(): CobraMappingIndex | null {
  try {
    const mapping = readJson<CobraMappingIndex>(MAPPING_FILE);
    return mapping && Array.isArray(mapping.tests) ? mapping : null;
  } catch {
    return null;
  }
}

export function readTrustedMapping(): CobraMappingIndex | null {
  try {
    const mapping = readJson<unknown>(TRUSTED_MAPPING_FILE);
    return isTrustedCobraMapping(mapping) ? mapping : null;
  } catch {
    return null;
  }
}

export function writeMapping(mapping: CobraMappingIndex): void {
  writeJson(MAPPING_FILE, mapping);
}

export function writeBuild(build: CobraBuild): void {
  writeJson(path.join(BUILDS_DIR, `${safeId(build.id)}.json`), build);
}

export function readBuild(id: string): CobraBuild | null {
  try {
    const build = readJson<CobraBuild>(path.join(BUILDS_DIR, `${safeId(id)}.json`));
    return build && typeof build.id === "string" ? build : null;
  } catch {
    return null;
  }
}

export function listBuilds(limit = 30): CobraBuild[] {
  if (!fs.existsSync(BUILDS_DIR)) return [];
  return fs
    .readdirSync(BUILDS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        const build = readJson<CobraBuild>(path.join(BUILDS_DIR, name));
        return build &&
          typeof build.id === "string" &&
          typeof build.receivedAt === "string" &&
          typeof build.status === "string" &&
          build.selection &&
          Array.isArray(build.executedTests)
          ? build
          : null;
      } catch {
        return null;
      }
    })
    .filter((build): build is CobraBuild => build !== null)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, limit);
}

export function readRunIndex(runId: string): RunIndex | null {
  return readJson<RunIndex>(path.join(RUNS_DIR, safeId(runId), "index.json"));
}

function latestBaselineRunId(): string | null {
  if (!fs.existsSync(RUNS_DIR)) return null;
  const runs = fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readRunIndex(entry.name))
    .filter(
      (index): index is RunIndex =>
        index !== null && index.kind === "baseline" && index.status === "passed"
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return runs[0]?.runId ?? null;
}

export function refreshMappingFromRun(requestedRunId?: string): CobraMappingIndex {
  const runId = requestedRunId ?? latestBaselineRunId();
  if (!runId) throw new Error("No COBRA coverage run is available");
  const index = readRunIndex(runId);
  if (!index) throw new Error(`COBRA run not found: ${runId}`);
  if (
    index.kind !== "baseline" ||
    index.status !== "passed" ||
    !index.finishedAt
  ) {
    throw new Error(
      `Run ${runId} is not a successfully completed baseline and cannot replace the mapping`
    );
  }
  if (
    !Number.isInteger(index.expectedTestCount) ||
    (index.expectedTestCount ?? 0) <= 0 ||
    index.tests.length !== index.expectedTestCount
  ) {
    throw new Error(
      `Baseline ${runId} recorded ${index.tests.length} of ` +
        `${index.expectedTestCount ?? "unknown"} expected tests`
    );
  }
  const nonPassing = index.tests.find((entry) => entry.status !== "passed");
  if (nonPassing) {
    throw new Error(
      `Baseline ${runId} contains a ${nonPassing.status} test: ${nonPassing.testId}`
    );
  }

  const tests: CobraMappingTest[] = [];
  for (const entry of index.tests) {
    const coverageDocument: PerTestCoverage | null = readJson<PerTestCoverage>(
      path.join(RUNS_DIR, safeId(runId), path.basename(entry.file))
    );
    if (!coverageDocument) {
      throw new Error(`Baseline ${runId} is missing ${entry.file}`);
    }
    if (coverageDocument.runId !== runId) {
      throw new Error(
        `Baseline ${runId} contains a document for run ${coverageDocument.runId}`
      );
    }
    if (
      coverageDocument.testId !== entry.testId ||
      (entry.stableTestId &&
        coverageDocument.stableTestId !== entry.stableTestId)
    ) {
      throw new Error(
        `Baseline ${runId} contains mismatched test metadata for ${entry.file}`
      );
    }
    tests.push({
      testId: coverageDocument.testId,
      stableTestId: coverageDocument.stableTestId,
      titlePath: coverageDocument.titlePath,
      projectName: coverageDocument.projectName,
      specFile: coverageDocument.specFile ?? entry.specFile,
      sourceRunId: runId,
      updatedAt: index.finishedAt ?? index.createdAt,
      status: entry.status,
      files: coverageDocument.files,
      externalDeps: coverageDocument.externalDeps,
      browserSourceMaps: coverageDocument.browserSourceMaps,
    });
  }
  if (tests.length !== index.expectedTestCount) {
    throw new Error(
      `Baseline ${runId} produced ${tests.length} valid mapping documents; ` +
        `expected ${index.expectedTestCount}`
    );
  }

  const now = new Date().toISOString();
  const paths = tests.flatMap((test) => test.files.map((file) => file.path));
  const sourceCount = paths.filter(isCobraRepositorySourcePath).length;
  const hasCompleteHostedSourceCoverage = tests.every(
    (test) =>
      test.status === "passed" &&
      hasUsableCobraRepositorySourceLines(test) &&
      isCompleteHostedBrowserSourceMaps(test.browserSourceMaps)
  );
  const mapping: CobraMappingIndex = {
    version: 1,
    baselineRunId: runId,
    baselineCommitSha: index.commitSha,
    deploymentVerified: index.deploymentVerified,
    coverageCapability:
      sourceCount === 0
        ? "generated-only"
        : hasCompleteHostedSourceCoverage
          ? "source"
          : "mixed",
    createdAt: now,
    updatedAt: now,
    tests: tests.sort((a, b) => a.testId.localeCompare(b.testId)),
  };
  writeJson(path.join(MAPPINGS_DIR, `${safeId(runId)}.json`), mapping);
  writeMapping(mapping);
  if (isTrustedCobraMapping(mapping)) {
    writeJson(TRUSTED_MAPPING_FILE, mapping);
  }
  return mapping;
}
