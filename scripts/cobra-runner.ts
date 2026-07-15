#!/usr/bin/env node

/**
 * Safety-first CLI for hosted COBRA coverage runs.
 *
 * The runner deliberately executes whole spec files for an impacted run. This
 * may run a few extra tests, but it avoids the fragile display-title grep that
 * previously risked selecting no tests at all.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeImpact } from "../apps/api/src/modules/cobra/cobra-impact.js";
import { collectGitChanges as collectRepositoryChanges } from "../apps/api/src/modules/cobra/cobra-git.js";
import {
  analyzeModuleImpact,
  fullModuleRegressionDecision,
  parseCobraModuleMap,
  type CobraModuleMap,
  type CobraModuleTest,
} from "../apps/api/src/modules/cobra/cobra-module-impact.js";
import { generateCoverageDashboard } from "../apps/web/tests/support/cobra/cobra-dashboard.js";
import { isTrustedCobraMapping } from "../packages/shared/src/types/cobra.js";
import type {
  CobraBuild,
  CobraChangedFile,
  CobraExecutedTest,
  CobraImpactDecision,
  CobraMappingIndex,
  RunIndex,
} from "../packages/shared/src/types/cobra.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const WEB_DIR = path.join(REPO_ROOT, "apps", "web");
const AUTOMATION_DIR = path.join(REPO_ROOT, "automationTestcase");
const AUTOMATION_CONFIG_FROM_WEB = "../../automationTestcase/playwright.config.ts";
// Resolve storage only after the same env file used by Playwright is loaded.
// Function declarations are hoisted, so this remains an eager, deterministic
// initialization without splitting runner and child artifacts across roots.
loadEnvFile(path.join(WEB_DIR, ".env"));
const COBRA_ROOT = process.env.COBRA_STORAGE_DIR
  ? path.resolve(process.env.COBRA_STORAGE_DIR)
  : path.join(REPO_ROOT, ".cobra");
const RUNS_DIR = path.join(COBRA_ROOT, "runs");
const BUILDS_DIR = path.join(COBRA_ROOT, "builds");
const MAPPINGS_DIR = path.join(COBRA_ROOT, "mappings");
const TRUSTED_MAPPING_FILE = path.join(MAPPINGS_DIR, "trusted.json");
const LATEST_MAPPING_FILE = path.join(MAPPINGS_DIR, "latest.json");
const MODULE_MAPPING_FILE = path.join(REPO_ROOT, "cobra.modules.json");
const DEFAULT_BASE_URL = "https://app.techinterview.co.in";
const MAX_GIT_OUTPUT = 20 * 1024 * 1024;

type CommandName = "baseline" | "impact" | "dashboard" | "help";
type ImpactStrategy = "source" | "modules";

type CliOptions = {
  command: CommandName;
  base?: string;
  head?: string;
  run?: string;
  commit?: string;
  baseUrl?: string;
  strategy?: ImpactStrategy;
  dryRun: boolean;
};

type DeploymentBuild = {
  endpoint: string;
  available: boolean;
  commitSha: string | null;
  sourceMaps: boolean | null;
  warning?: string;
};

type RunnerBuild = CobraBuild & {
  warnings?: string[];
  deployment?: DeploymentBuild;
  selectedSpecFiles?: string[];
  selectedTestTags?: string[];
  strategy?: ImpactStrategy;
};

type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type ImpactExecutionContext = {
  buildId?: string;
  baseSha?: string;
  headSha?: string;
  baseUrl: string;
  changedFiles?: CobraChangedFile[];
  mapping?: CobraMappingIndex | null;
  deployment?: DeploymentBuild;
};

function printHelp(): void {
  console.log(`COBRA hosted coverage runner

Usage:
  cobra-runner baseline [--run <id>] [--commit <sha>] [--base-url <url>] [--dry-run]
  cobra-runner impact --base <ref> --head <ref> [--strategy source|modules] [--run <id>] [--base-url <url>] [--dry-run]
  cobra-runner dashboard [--run <id>] [--dry-run]

Commands:
  baseline   Discover and run every test configured by automationTestcase/playwright.config.ts.
             A baseline is promoted only when Playwright records the exact discovered count.
  impact     Diff two verified Git commits and run the selected automation tests. The source
             strategy requires deployment evidence; the modules strategy uses the reviewed
             repository path map and needs no hosting integration.
  dashboard  Regenerate .cobra/dashboard/index.html for a run (latest run by default).

Options:
  --base <ref>       Required base Git ref for impact analysis.
  --head <ref>       Required head Git ref for impact analysis.
  --run <id>         Explicit filesystem-safe run/build ID.
  --commit <sha>     Baseline commit override when local Git metadata is unavailable.
  --base-url <url>   Hosted application URL (defaults to E2E_BASE_URL or ${DEFAULT_BASE_URL}).
  --strategy <name>  Impact selector: source (default) or modules (deployment-independent).
  --dry-run          Validate and print the plan without starting Playwright or writing state.
  -h, --help         Show this help.
`);
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help", dryRun: false };
  }

  const command = argv[0];
  if (!(["baseline", "impact", "dashboard"] as string[]).includes(command)) {
    throw new Error(`Unknown command: ${command}. Run with --help for usage.`);
  }

  const options: CliOptions = {
    command: command as Exclude<CommandName, "help">,
    dryRun: false,
  };

  const keys: Record<string, keyof CliOptions> = {
    "--base": "base",
    "--head": "head",
    "--run": "run",
    "--commit": "commit",
    "--base-url": "baseUrl",
    "--strategy": "strategy",
  };

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      return { command: "help", dryRun: false };
    }
    const key = keys[token];
    if (!key) throw new Error(`Unknown option: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value`);
    }
    (options as Record<string, unknown>)[key] = value;
    index += 1;
  }

  if (options.command === "impact" && (!options.base || !options.head)) {
    throw new Error("impact requires both --base <ref> and --head <ref>");
  }
  if (options.command !== "impact" && (options.base || options.head)) {
    throw new Error("--base and --head are only valid with impact");
  }
  if (options.command !== "baseline" && options.commit) {
    throw new Error("--commit is only valid with baseline");
  }
  if (options.command !== "impact" && options.strategy) {
    throw new Error("--strategy is only valid with impact");
  }
  if (options.strategy && options.strategy !== "source" && options.strategy !== "modules") {
    throw new Error("--strategy must be source or modules");
  }
  return options;
}

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function safeId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, dot, underscore, and dash`);
  }
  return value;
}

function assertIdAvailable(id: string): void {
  const runDirectory = path.join(RUNS_DIR, id);
  const buildFile = path.join(BUILDS_DIR, `${id}.json`);
  if (fs.existsSync(runDirectory) || fs.existsSync(buildFile)) {
    throw new Error(
      `COBRA run/build id already exists: ${id}. Choose a new --run id to avoid mixing stale results.`
    );
  }
}

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

function corepackExecutable(): string {
  return process.platform === "win32" ? "corepack.cmd" : "corepack";
}

function playwrightArguments(extra: string[] = []): string[] {
  return [
    "pnpm",
    "--dir",
    "apps/web",
    "exec",
    "playwright",
    "test",
    "--config",
    AUTOMATION_CONFIG_FROM_WEB,
    ...extra,
  ];
}

function runCaptured(command: string, args: string[], environment = process.env): ProcessResult {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: environment,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT,
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
  });
  if (result.error) throw result.error;
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runPlaywright(extra: string[], environment: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(corepackExecutable(), playwrightArguments(extra), {
      cwd: REPO_ROOT,
      env: environment,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

function discoverAutomationTestCount(testFiles: string[] = []): number {
  const environment = {
    ...process.env,
    COBRA_ENABLED: "0",
    HOSTED_COVERAGE: "0",
  };
  const result = runCaptured(
    corepackExecutable(),
    playwrightArguments(["--list", ...testFiles]),
    environment
  );
  if (result.code !== 0) {
    throw new Error(
      `Unable to discover the automation suite (exit ${result.code}):\n${result.stderr || result.stdout}`
    );
  }
  const plain = `${result.stdout}\n${result.stderr}`.replace(/\u001b\[[0-9;]*m/g, "");
  const match = plain.match(/Total:\s+(\d+)\s+tests?\s+in\s+\d+\s+files?/i);
  if (!match) {
    throw new Error("Playwright --list did not report a parseable total test count");
  }
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("The configured automation suite contains no tests");
  }
  return count;
}

function git(args: string[]): string {
  const result = runCaptured("git", args);
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "git command failed").trim());
  }
  return result.stdout;
}

function requireGitRepository(): string {
  let root: string;
  try {
    root = git(["rev-parse", "--show-toplevel"]).trim();
  } catch (error) {
    throw new Error(
      `Impact mode requires a valid Git repository at ${REPO_ROOT}: ${(error as Error).message}`
    );
  }
  if (path.resolve(root).toLowerCase() !== REPO_ROOT.toLowerCase()) {
    throw new Error(`Git root ${root} does not match the COBRA repository ${REPO_ROOT}`);
  }
  return root;
}

function resolveCommit(ref: string): string {
  try {
    return git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
  } catch (error) {
    throw new Error(`Git ref ${JSON.stringify(ref)} is not a valid commit: ${(error as Error).message}`);
  }
}

type BaselineLocalRevision = {
  commitSha: string;
  checkoutVerified: boolean;
  warning?: string;
};

function workingTreeChangeCount(): number {
  const output = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  return output.split(/\r?\n/).filter(Boolean).length;
}

function resolveBaselineLocalRevision(
  requestedRef: string | undefined
): BaselineLocalRevision {
  let hasRepository = true;
  try {
    requireGitRepository();
  } catch {
    hasRepository = false;
  }

  if (!hasRepository) {
    if (requestedRef && !/^[0-9a-f]{7,40}$/i.test(requestedRef)) {
      throw new Error(
        "--commit must be a hexadecimal Git SHA when repository metadata is unavailable"
      );
    }
    return {
      commitSha: requestedRef?.toLowerCase() ?? "unversioned",
      checkoutVerified: false,
      warning:
        "The local source/test checkout has no verifiable Git metadata; this baseline cannot enable selective impact runs.",
    };
  }

  const headSha = resolveCommit("HEAD");
  const commitSha = requestedRef ? resolveCommit(requestedRef) : headSha;
  const changedEntries = workingTreeChangeCount();
  const checkoutVerified = headSha === commitSha && changedEntries === 0;
  let warning: string | undefined;
  if (headSha !== commitSha) {
    warning = `The checked-out HEAD ${headSha} does not match baseline revision ${commitSha}; mapping provenance is unverified.`;
  } else if (changedEntries > 0) {
    warning = `The Git worktree contains ${changedEntries} uncommitted entr${
      changedEntries === 1 ? "y" : "ies"
    }; mapping provenance is unverified.`;
  }
  return { commitSha, checkoutVerified, warning };
}

function assertExactCleanCheckout(headSha: string): void {
  const checkoutSha = resolveCommit("HEAD");
  if (checkoutSha !== headSha) {
    throw new Error(
      `Impact execution requires HEAD ${headSha}, but the current checkout is ${checkoutSha}. Check out the requested head first.`
    );
  }
  const changedEntries = workingTreeChangeCount();
  if (changedEntries > 0) {
    throw new Error(
      `Impact execution requires a clean Git worktree; found ${changedEntries} uncommitted entr${
        changedEntries === 1 ? "y" : "ies"
      }.`
    );
  }
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function shasPrefixMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a.length < 7 || b.length < 7 || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) {
    return false;
  }
  return a.startsWith(b) || b.startsWith(a);
}

async function readDeploymentBuild(baseUrl: string): Promise<DeploymentBuild> {
  let endpoint: string;
  try {
    endpoint = new URL("/api/cobra-build", baseUrl).toString();
  } catch {
    return {
      endpoint: `${baseUrl}/api/cobra-build`,
      available: false,
      commitSha: null,
      sourceMaps: null,
      warning: `Invalid E2E base URL: ${baseUrl}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        endpoint,
        available: false,
        commitSha: null,
        sourceMaps: null,
        warning: `Deployment metadata returned HTTP ${response.status}`,
      };
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const payload =
      raw.data && typeof raw.data === "object"
        ? (raw.data as Record<string, unknown>)
        : raw;
    const commitSha =
      typeof payload.commitSha === "string" && payload.commitSha.trim()
        ? payload.commitSha.trim()
        : null;
    const sourceMaps =
      typeof payload.sourceMaps === "boolean" ? payload.sourceMaps : null;
    return { endpoint, available: true, commitSha, sourceMaps };
  } catch (error) {
    return {
      endpoint,
      available: false,
      commitSha: null,
      sourceMaps: null,
      warning: `Deployment metadata unavailable: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function fullRegressionDecision(
  changedFiles: CobraChangedFile[],
  mapping: CobraMappingIndex | null,
  reason: "mapping-missing" | "unmapped-change" = "mapping-missing"
): CobraImpactDecision {
  return {
    mode: "full-regression",
    reason,
    changedFiles,
    recommendedTests: [...new Set(mapping?.tests.map((test) => test.testId) ?? [])].sort(),
    skippedTests: [],
    unmappedFiles: changedFiles.map((file) => file.path).sort(),
  };
}

function selectedSpecFiles(
  mapping: CobraMappingIndex,
  recommendedTests: string[]
): { files: string[]; warnings: string[] } {
  const files = new Set<string>();
  const warnings: string[] = [];

  for (const testId of recommendedTests) {
    const matches = mapping.tests.filter((test) => test.testId === testId);
    if (matches.length === 0) {
      warnings.push(`Mapping entry is missing for selected test: ${testId}`);
      continue;
    }
    for (const test of matches) {
      if (!test.specFile) {
        warnings.push(`Selected test has no spec file: ${testId}`);
        continue;
      }
      const absolute = path.resolve(REPO_ROOT, test.specFile);
      const relativeToAutomation = path.relative(AUTOMATION_DIR, absolute);
      if (
        relativeToAutomation.startsWith("..") ||
        path.isAbsolute(relativeToAutomation) ||
        !fs.existsSync(absolute) ||
        !/^[a-zA-Z0-9_./\\-]+$/.test(relativeToAutomation)
      ) {
        warnings.push(`Selected spec is unavailable in the stable automation suite: ${test.specFile}`);
        continue;
      }
      files.add(normalizeRepoPath(path.relative(WEB_DIR, absolute)));
    }
  }

  return { files: [...files].sort(), warnings };
}

function readModuleMap(): CobraModuleMap {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(MODULE_MAPPING_FILE, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read ${path.basename(MODULE_MAPPING_FILE)}: ${(error as Error).message}`
    );
  }
  try {
    return parseCobraModuleMap(value);
  } catch (error) {
    throw new Error(`Invalid COBRA module map: ${(error as Error).message}`);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
}

function modulePlaywrightSelection(selectedTests: CobraModuleTest[]): {
  args: string[];
  files: string[];
  tags: string[];
  warnings: string[];
} {
  const files = new Set<string>();
  const tags = new Set<string>();
  const warnings: string[] = [];

  for (const test of selectedTests) {
    const absolute = path.resolve(REPO_ROOT, test.specFile);
    const relativeToAutomation = path.relative(AUTOMATION_DIR, absolute);
    if (
      relativeToAutomation.startsWith("..") ||
      path.isAbsolute(relativeToAutomation) ||
      !fs.existsSync(absolute)
    ) {
      warnings.push(`Module test ${test.id} has an unavailable spec: ${test.specFile}`);
      continue;
    }
    const playwrightFile = normalizeRepoPath(path.relative(WEB_DIR, absolute));
    const tagPattern = escapeRegex(test.tag);
    try {
      const count = discoverAutomationTestCount([playwrightFile, "--grep", tagPattern]);
      if (count !== 1) {
        warnings.push(
          `Module test ${test.id} tag ${test.tag} resolved to ${count} tests instead of exactly one.`
        );
        continue;
      }
    } catch (error) {
      warnings.push(
        `Module test ${test.id} tag validation failed: ${(error as Error).message}`
      );
      continue;
    }
    files.add(playwrightFile);
    tags.add(test.tag);
  }

  if (warnings.length > 0 || tags.size !== selectedTests.length) {
    return { args: [], files: [], tags: [], warnings };
  }
  const pattern = [...tags].map(escapeRegex).join("|");
  const args = [...files].sort();
  args.push("--grep", `(?:${pattern})`);
  const combinedCount = discoverAutomationTestCount(args);
  if (combinedCount !== selectedTests.length) {
    warnings.push(
      `Combined module selection resolved to ${combinedCount} tests instead of ${selectedTests.length}.`
    );
    return { args: [], files: [], tags: [], warnings };
  }
  return {
    args,
    files: [...files].sort(),
    tags: [...tags].sort(),
    warnings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMappingIndex(value: unknown): value is CobraMappingIndex {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.baselineRunId === "string" &&
    Array.isArray(value.tests) &&
    value.tests.every(
      (test) =>
        isRecord(test) &&
        typeof test.testId === "string" &&
        typeof test.sourceRunId === "string" &&
        Array.isArray(test.files) &&
        test.files.every(
          (file) =>
            isRecord(file) &&
            typeof file.path === "string" &&
            Array.isArray(file.linesTouched) &&
            file.linesTouched.every(
              (line) => Number.isInteger(line) && (line as number) > 0
            )
        )
    )
  );
}

/** Public for focused safety tests; impact execution uses the same guard. */
export function isSelectiveCobraMapping(
  value: unknown
): value is CobraMappingIndex {
  return isMappingIndex(value) && isTrustedCobraMapping(value);
}

function readMappingSafely(): {
  mapping: CobraMappingIndex | null;
  warning?: string;
} {
  const warnings: string[] = [];
  const candidates = [
    { label: "trusted", file: TRUSTED_MAPPING_FILE },
    { label: "latest", file: LATEST_MAPPING_FILE },
  ];

  for (const candidate of candidates) {
    try {
      const value = readJson<unknown>(candidate.file);
      if (value === null) continue;
      if (!isMappingIndex(value)) {
        warnings.push(`The ${candidate.label} baseline mapping has an invalid structure.`);
        continue;
      }
      if (!isSelectiveCobraMapping(value)) {
        warnings.push(
          `The ${candidate.label} baseline mapping lacks complete hosted source-line evidence for every test and cannot select tests.`
        );
        continue;
      }
      return {
        mapping: value,
        warning: warnings.length > 0 ? `${warnings.join(" ")} Using the verified source mapping.` : undefined,
      };
    } catch (error) {
      warnings.push(
        `The ${candidate.label} baseline mapping could not be read: ${(error as Error).message}`
      );
    }
  }

  warnings.push("No verified source baseline mapping is available; full regression is required.");
  return { mapping: null, warning: warnings.join(" ") };
}

function readRunIndex(runId: string): RunIndex | null {
  return readJson<RunIndex>(path.join(RUNS_DIR, safeId(runId, "run id"), "index.json"));
}

function collectRunResults(runId: string): CobraExecutedTest[] {
  return (
    readRunIndex(runId)?.tests.map((test) => ({
      testId: test.testId,
      status: test.status,
      durationMs: test.durationMs,
    })) ?? []
  );
}

function runCompletionError(runId: string, expectedTestCount: number): string | null {
  const index = readRunIndex(runId);
  if (!index) return "Playwright produced no COBRA run index";
  if (!index.finishedAt || index.status !== "passed") {
    return `COBRA run index ended with status ${index.status ?? "unknown"}`;
  }
  if (index.tests.length !== expectedTestCount) {
    return `COBRA recorded ${index.tests.length} of ${expectedTestCount} expected tests`;
  }
  const nonPassing = index.tests.find((test) => test.status !== "passed");
  if (nonPassing) {
    return `COBRA test ${nonPassing.testId} ended with status ${nonPassing.status}`;
  }
  return null;
}

function latestRunId(): string | null {
  if (!fs.existsSync(RUNS_DIR)) return null;
  const runs = fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readRunIndex(entry.name))
    .filter(
      (index): index is RunIndex =>
        index !== null && Boolean(index.finishedAt) && index.status !== "running"
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return runs[0]?.runId ?? null;
}

function runMetadataPath(runId: string): string {
  return path.join(RUNS_DIR, safeId(runId, "run id"), "runner-metadata.json");
}

function ensureCompletedRunSnapshot(
  runId: string,
  input: {
    createdAt: string;
    finishedAt: string;
    status: "passed" | "failed";
    commitSha: string;
    targetUrl: string;
    deploymentVerified: boolean;
  }
): void {
  if (readRunIndex(runId)) return;
  const index: RunIndex = {
    runId,
    kind: "impact",
    coverageMode: "hosted-browser",
    targetUrl: input.targetUrl,
    commitSha: input.commitSha,
    deploymentVerified: input.deploymentVerified,
    expectedTestCount: 0,
    status: input.status,
    createdAt: input.createdAt,
    finishedAt: input.finishedAt,
    tests: [],
  };
  writeJsonAtomic(path.join(RUNS_DIR, runId, "index.json"), index);
}

async function baseline(options: CliOptions): Promise<void> {
  const runId = safeId(options.run ?? `baseline-${timestampId()}`, "run id");
  assertIdAvailable(runId);
  const expectedTestCount = discoverAutomationTestCount();
  const baseUrl = options.baseUrl ?? process.env.E2E_BASE_URL ?? DEFAULT_BASE_URL;
  const localRevision = resolveBaselineLocalRevision(options.commit);
  const localCommitSha = localRevision.commitSha;
  const deployment = await readDeploymentBuild(baseUrl);
  const coverageCommitSha = deployment.commitSha ?? localCommitSha;
  const deploymentVerified =
    localRevision.checkoutVerified &&
    shasPrefixMatch(localCommitSha, deployment.commitSha);
  const warnings: string[] = [];

  if (localRevision.warning) warnings.push(localRevision.warning);
  if (deployment.warning) warnings.push(deployment.warning);
  if (!deployment.commitSha) {
    warnings.push(
      `Deployment commit is unverified; baseline is tagged ${coverageCommitSha} and cannot safely enable selective impact runs.`
    );
  } else if (
    localCommitSha !== "unversioned" &&
    !shasPrefixMatch(localCommitSha, deployment.commitSha)
  ) {
    warnings.push(
      `Local/declared commit ${localCommitSha} differs from deployed commit ${deployment.commitSha}; coverage is tagged with the deployed commit.`
    );
  }
  if (deployment.sourceMaps !== true) {
    warnings.push("The deployment does not confirm browser source maps; the mapping may be generated-only.");
  }

  const metadata = {
    command: "baseline",
    runId,
    kind: "baseline",
    createdAt: new Date().toISOString(),
    commitSha: coverageCommitSha,
    localCommitSha,
    expectedTestCount,
    deploymentVerified,
    baseUrl,
    config: "automationTestcase/playwright.config.ts",
    deployment,
    warnings,
  };

  console.log(JSON.stringify({ dryRun: options.dryRun, ...metadata }, null, 2));
  warnings.forEach((warning) => console.warn(`[cobra] warning: ${warning}`));
  if (options.dryRun) return;

  writeJsonAtomic(runMetadataPath(runId), metadata);
  const code = await runPlaywright([], {
    ...process.env,
    E2E_BASE_URL: baseUrl,
    HOSTED_COVERAGE: "1",
    COBRA_ENABLED: "0",
    COBRA_RUN_KIND: "baseline",
    COBRA_RUN_ID: runId,
    COBRA_COMMIT_SHA: coverageCommitSha,
    COBRA_DEPLOYMENT_VERIFIED: deploymentVerified ? "1" : "0",
    COBRA_EXPECTED_TEST_COUNT: String(expectedTestCount),
  });
  if (code !== 0) {
    throw new Error(`Baseline Playwright run failed with exit code ${code}`);
  }
  console.log(`[cobra] baseline completed and promoted: ${runId}`);
  console.log(`[cobra] dashboard: ${path.join(COBRA_ROOT, "dashboard", "index.html")}`);
}

function branchForHead(headRef: string): string {
  try {
    const branch = git(["branch", "--show-current"]).trim();
    return branch || headRef;
  } catch {
    return headRef;
  }
}

function writeBuild(build: RunnerBuild): string {
  const file = path.join(BUILDS_DIR, `${safeId(build.id, "build id")}.json`);
  writeJsonAtomic(file, build);
  return file;
}

function availablePreflightBuildId(options: CliOptions, context: ImpactExecutionContext): string {
  const candidates = [context.buildId, options.run].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  for (const candidate of candidates) {
    try {
      const id = safeId(candidate, "build id");
      if (
        !fs.existsSync(path.join(BUILDS_DIR, `${id}.json`)) &&
        !fs.existsSync(path.join(RUNS_DIR, id))
      ) {
        return id;
      }
    } catch {
      // The original validation error is recorded under a generated safe ID.
    }
  }

  let id = `impact-preflight-${timestampId()}`;
  let suffix = 1;
  while (
    fs.existsSync(path.join(BUILDS_DIR, `${id}.json`)) ||
    fs.existsSync(path.join(RUNS_DIR, id))
  ) {
    id = `impact-preflight-${timestampId()}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function recordImpactPreflightFailure(
  options: CliOptions,
  context: ImpactExecutionContext,
  error: unknown
): string | null {
  if (options.dryRun) return null;

  if (
    context.buildId &&
    fs.existsSync(path.join(BUILDS_DIR, `${context.buildId}.json`))
  ) {
    return null;
  }

  const id = availablePreflightBuildId(options, context);
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const changedFiles = context.changedFiles ?? [];
  const commitSha = context.headSha ?? options.head ?? "unknown";
  const failed: RunnerBuild = {
    id,
    baseSha: context.baseSha ?? options.base,
    headSha: context.headSha ?? options.head,
    commitSha,
    branch: options.head ?? commitSha,
    source: "manual",
    receivedAt: now,
    finishedAt: now,
    durationMs: 0,
    status: "failed",
    selection: fullRegressionDecision(changedFiles, context.mapping ?? null),
    executedTests: [],
    error: message,
    deployment: context.deployment,
  };
  const file = writeBuild(failed);
  ensureCompletedRunSnapshot(id, {
    createdAt: now,
    finishedAt: now,
    status: "failed",
    commitSha,
    targetUrl: context.baseUrl,
    deploymentVerified: false,
  });
  try {
    generateCoverageDashboard(id);
  } catch (dashboardError) {
    console.warn(
      `[cobra] warning: failed to refresh the dashboard for preflight failure ${id}: ${
        dashboardError instanceof Error ? dashboardError.message : String(dashboardError)
      }`
    );
  }
  return file;
}

async function impact(options: CliOptions, context: ImpactExecutionContext): Promise<void> {
  requireGitRepository();
  const baseSha = resolveCommit(options.base!);
  context.baseSha = baseSha;
  const headSha = resolveCommit(options.head!);
  context.headSha = headSha;
  assertExactCleanCheckout(headSha);
  const buildId = safeId(
    options.run ?? `impact-${headSha.slice(0, 12)}-${timestampId()}`,
    "build id"
  );
  assertIdAvailable(buildId);
  context.buildId = buildId;
  const changedFiles = await collectRepositoryChanges({
    mode: "base-head",
    cwd: REPO_ROOT,
    base: baseSha,
    head: headSha,
  });
  context.changedFiles = changedFiles;
  const baseUrl = context.baseUrl;
  const strategy = options.strategy ?? "source";
  const warnings: string[] = [];
  let mapping: CobraMappingIndex | null = null;
  let deployment: DeploymentBuild = {
    endpoint: "not-required:module-map",
    available: false,
    commitSha: null,
    sourceMaps: null,
    warning: "Deployment identity is not required by the reviewed module-map strategy.",
  };
  let selection: CobraImpactDecision;
  let specs: string[] = [];
  let selectedPlaywrightArguments: string[] = [];
  let selectedTestTags: string[] = [];
  let matchedModules: string[] = [];
  let ignoredFiles: string[] = [];

  if (strategy === "modules") {
    warnings.push(
      "Tests are selected from the reviewed Git module map. The hosted URL is not proven to contain the requested Git head."
    );
    let moduleMap: CobraModuleMap | null = null;
    try {
      moduleMap = readModuleMap();
    } catch (error) {
      warnings.push(`${(error as Error).message} Running the full automation suite.`);
    }

    if (!moduleMap) {
      selection =
        changedFiles.length === 0
          ? analyzeImpact(null, changedFiles)
          : fullRegressionDecision(changedFiles, null);
    } else {
      const moduleResult = analyzeModuleImpact(moduleMap, changedFiles);
      selection = moduleResult.decision;
      matchedModules = moduleResult.matchedModules;
      ignoredFiles = moduleResult.ignoredFiles;
      if (selection.mode === "impacted" && selection.recommendedTests.length > 0) {
        const resolved = modulePlaywrightSelection(moduleResult.selectedTests);
        warnings.push(...resolved.warnings);
        if (resolved.warnings.length > 0 || resolved.args.length === 0) {
          selection = fullModuleRegressionDecision(moduleMap, changedFiles);
          warnings.push(
            "At least one configured tag did not resolve to exactly one stable test; running the full suite."
          );
        } else {
          specs = resolved.files;
          selectedTestTags = resolved.tags;
          selectedPlaywrightArguments = resolved.args;
        }
      }
    }
  } else {
    const mappingResult = readMappingSafely();
    mapping = mappingResult.mapping;
    context.mapping = mapping;
    deployment = await readDeploymentBuild(baseUrl);
    context.deployment = deployment;
    if (mappingResult.warning) warnings.push(mappingResult.warning);

    if (changedFiles.length > 0 && (!deployment.available || !deployment.commitSha)) {
      throw new Error(
        `Refusing impact execution: hosted deployment identity is unavailable at ${deployment.endpoint}. ` +
          "Use --strategy modules when deployment integration is unavailable."
      );
    }
    if (changedFiles.length > 0 && !shasPrefixMatch(deployment.commitSha, headSha)) {
      throw new Error(
        `Refusing impact execution: hosted deployment ${deployment.commitSha} does not match requested head ${headSha}.`
      );
    }

    let trustedMapping = mapping;
    if (deployment.warning) warnings.push(deployment.warning);
    if (changedFiles.length > 0) {
      if (deployment.sourceMaps !== true) {
        warnings.push("Hosted browser source maps are unavailable or unverified; selective skipping is disabled.");
        trustedMapping = null;
      }
      if (!mapping?.baselineCommitSha || !shasPrefixMatch(mapping.baselineCommitSha, baseSha)) {
        warnings.push("The promoted baseline does not match the requested base revision; selective skipping is disabled.");
        trustedMapping = null;
      }
      if (mapping?.deploymentVerified !== true) {
        warnings.push("The promoted baseline was not verified against its deployed revision; selective skipping is disabled.");
        trustedMapping = null;
      }
      if (mapping?.coverageCapability !== "source") {
        warnings.push("The promoted baseline is not exact source coverage; selective skipping is disabled.");
        trustedMapping = null;
      }
    }

    selection =
      changedFiles.length === 0
        ? analyzeImpact(mapping, changedFiles)
        : trustedMapping
          ? analyzeImpact(trustedMapping, changedFiles)
          : fullRegressionDecision(changedFiles, mapping);

    if (selection.mode === "impacted" && selection.recommendedTests.length > 0 && trustedMapping) {
      const resolved = selectedSpecFiles(trustedMapping, selection.recommendedTests);
      warnings.push(...resolved.warnings);
      specs = resolved.files;
      if (resolved.warnings.length > 0 || specs.length === 0) {
        selection = fullRegressionDecision(changedFiles, mapping, "unmapped-change");
        specs = [];
        warnings.push("At least one selected test could not be resolved to a stable spec file; running the full suite.");
      } else {
        selectedPlaywrightArguments = specs;
      }
    }
  }

  context.deployment = deployment;
  if (selection.mode !== "impacted") {
    specs = [];
    selectedTestTags = [];
    selectedPlaywrightArguments = [];
  }
  const expectedTestCount =
    selection.mode === "impacted" && selection.recommendedTests.length === 0
      ? 0
      : discoverAutomationTestCount(selectedPlaywrightArguments);
  const deploymentVerified =
    strategy === "source" && shasPrefixMatch(deployment.commitSha, headSha);

  const build: RunnerBuild = {
    id: buildId,
    baseSha,
    headSha,
    commitSha: headSha,
    branch: branchForHead(options.head!),
    source: "manual",
    receivedAt: new Date().toISOString(),
    status: "queued",
    expectedTestCount,
    selection,
    executedTests: [],
    warnings,
    deployment,
    selectedSpecFiles: specs,
    selectedTestTags,
    strategy,
  };

  const plan = {
    dryRun: options.dryRun,
    buildId,
    baseSha,
    headSha,
    changedFiles,
    selection,
    strategy,
    matchedModules,
    ignoredFiles,
    selectedSpecFiles: specs,
    selectedTestTags,
    expectedTestCount,
    warnings,
  };
  console.log(JSON.stringify(plan, null, 2));
  warnings.forEach((warning) => console.warn(`[cobra] warning: ${warning}`));
  if (options.dryRun) return;

  const buildFile = writeBuild(build);
  if (selection.mode === "impacted" && selection.recommendedTests.length === 0) {
    build.status = "passed";
    build.finishedAt = new Date().toISOString();
    build.durationMs = 0;
    writeBuild(build);
    ensureCompletedRunSnapshot(buildId, {
      createdAt: build.receivedAt,
      finishedAt: build.finishedAt,
      status: "passed",
      commitSha: headSha,
      targetUrl: baseUrl,
      deploymentVerified,
    });
    generateCoverageDashboard(buildId);
    console.log(`[cobra] no impacted tests; build recorded at ${buildFile}`);
    return;
  }

  const started = Date.now();
  build.status = "running";
  build.startedAt = new Date(started).toISOString();
  build.runId = buildId;
  writeBuild(build);
  writeJsonAtomic(runMetadataPath(buildId), {
    command: "impact",
    runId: buildId,
    kind: "impact",
    createdAt: build.startedAt,
    baseSha,
    headSha,
    baseUrl,
    config: "automationTestcase/playwright.config.ts",
    selection,
    strategy,
    matchedModules,
    ignoredFiles,
    selectedSpecFiles: specs,
    selectedTestTags,
    expectedTestCount,
    deployment,
    warnings,
  });

  try {
    const code = await runPlaywright(selectedPlaywrightArguments, {
      ...process.env,
      E2E_BASE_URL: baseUrl,
      HOSTED_COVERAGE: "1",
      COBRA_ENABLED: "0",
      COBRA_RUN_KIND: "impact",
      COBRA_RUN_ID: buildId,
      COBRA_COMMIT_SHA: headSha,
      COBRA_EXPECTED_TEST_COUNT: String(expectedTestCount),
      COBRA_DEPLOYMENT_VERIFIED: deploymentVerified ? "1" : "0",
    });
    build.executedTests = collectRunResults(buildId);
    const completionError = runCompletionError(buildId, expectedTestCount);
    build.status = code === 0 && !completionError ? "passed" : "failed";
    if (code !== 0) build.error = `Playwright exited with code ${code}`;
    else if (completionError) build.error = completionError;
  } catch (error) {
    build.executedTests = collectRunResults(buildId);
    build.status = "failed";
    build.error = (error as Error).message;
  }

  build.finishedAt = new Date().toISOString();
  build.durationMs = Date.now() - started;
  writeBuild(build);
  ensureCompletedRunSnapshot(buildId, {
    createdAt: build.startedAt,
    finishedAt: build.finishedAt,
    status: build.status === "passed" ? "passed" : "failed",
    commitSha: headSha,
    targetUrl: baseUrl,
    deploymentVerified,
  });
  generateCoverageDashboard(buildId);
  console.log(`[cobra] impact build recorded at ${buildFile}`);
  if (build.status !== "passed") {
    throw new Error(build.error ?? "Impact Playwright run failed");
  }
}

function dashboard(options: CliOptions): void {
  const runId = options.run ? safeId(options.run, "run id") : latestRunId();
  if (!runId) throw new Error("No COBRA coverage run is available");
  if (!readRunIndex(runId)) throw new Error(`COBRA run not found: ${runId}`);
  if (options.dryRun) {
    console.log(JSON.stringify({ dryRun: true, runId }, null, 2));
    return;
  }
  const output = generateCoverageDashboard(runId);
  console.log(`[cobra] coverage dashboard: ${output}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help") {
    printHelp();
    return;
  }
  if (options.command === "baseline") await baseline(options);
  else if (options.command === "impact") {
    const context: ImpactExecutionContext = {
      baseUrl: options.baseUrl ?? process.env.E2E_BASE_URL ?? DEFAULT_BASE_URL,
    };
    try {
      await impact(options, context);
    } catch (error) {
      const failureFile = recordImpactPreflightFailure(options, context, error);
      if (failureFile) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\nFailed build recorded at ${failureFile}`
        );
      }
      throw error;
    }
  } else dashboard(options);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`[cobra] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
