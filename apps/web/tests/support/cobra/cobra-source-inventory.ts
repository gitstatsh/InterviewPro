/**
 * Repository source inventory used by the standalone COBRA dashboard.
 *
 * This is intentionally independent of the deployed JavaScript chunks. It
 * inventories every eligible application source file so code which was never
 * loaded by a browser test still appears as uncovered instead of disappearing
 * from the denominator.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type MappingFile = {
  path?: string;
  linesTouched?: number[];
};

type MappingTest = {
  testId?: string;
  files?: MappingFile[];
};

type MappingDocument = {
  baselineRunId?: string;
  deploymentVerified?: boolean;
  updatedAt?: string;
  tests?: MappingTest[];
};

export type SourceLineRange = [number, number];

export type CobraSourceInventoryFile = {
  path: string;
  totalLines: number;
  touchedLines: number[];
  touchedLineCount: number;
  uncoveredLines: number[];
  uncoveredLineCount: number;
  uncoveredRanges: SourceLineRange[];
  coveragePercent: number | null;
  mappedTests: string[];
};

export type CobraSourceInventorySummary = {
  totalFiles: number;
  measuredFiles: number;
  notApplicableFiles: number;
  coveredFiles: number;
  partiallyCoveredFiles: number;
  fullyCoveredFiles: number;
  uncoveredFiles: number;
  totalLines: number;
  touchedLines: number;
  uncoveredLines: number;
  coveragePercent: number | null;
  mappedTests: number;
};

export type CobraSourceInventory = {
  roots: string[];
  files: CobraSourceInventoryFile[];
  summary: CobraSourceInventorySummary;
  mapping: {
    ready: boolean;
    status: "ready" | "missing" | "invalid" | "unmapped";
    error?: string;
    deploymentVerified: boolean;
    baselineRunId?: string;
    updatedAt?: string;
    testCount: number;
    mappedFileCount: number;
    ignoredNonRepoFileCount: number;
  };
};

/** Immutable source view captured beside one COBRA run. */
export type CobraSourceInventorySnapshot = {
  version: 1;
  runId: string;
  capturedAt: string;
  /** Repo-relative or storage-relative mapping artifact used for this view. */
  mappingArtifact: string;
  inventory: CobraSourceInventory;
};

export type SourceInventoryOptions = {
  repoRoot?: string;
  mappingFile?: string;
};

const DEFAULT_REPO_ROOT = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  ".."
);
const SOURCE_ROOTS = ["apps/web/src", "apps/api/src", "packages/shared/src"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDED_DIRECTORIES = new Set([
  "__generated__",
  "__tests__",
  "coverage",
  "dist",
  "generated",
  "test",
  "tests",
  "testing",
]);

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
}

function isUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

/** Returns a normalized repo path, or null for URLs and paths outside the repo. */
export function normalizeInventoryPath(
  value: string,
  repoRoot = DEFAULT_REPO_ROOT
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (/^file:\/\//i.test(candidate)) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      return null;
    }
  } else if (isUrl(candidate)) return null;

  if (path.isAbsolute(candidate)) {
    const relative = path.relative(repoRoot, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    candidate = relative;
  }

  const normalized = normalizeSlashes(candidate);
  if (normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

function isExcludedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.includes(".spec.") ||
    lower.includes(".test.") ||
    lower.includes(".generated.") ||
    lower.endsWith(".min.js")
  );
}

function collectSourceFiles(directory: string, output: string[]): void {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) {
        collectSourceFiles(fullPath, output);
      }
      continue;
    }
    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
      !isExcludedFile(entry.name)
    ) {
      output.push(fullPath);
    }
  }
}

/**
 * Removes line and block comments while preserving newlines. String and
 * template literal contents are retained because their lines are source code.
 */
function stripComments(source: string): string {
  let output = "";
  let state: "code" | "line" | "block" | "single" | "double" | "template" =
    "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line") {
      if (character === "\n") {
        output += character;
        state = "code";
      } else {
        output += " ";
      }
      continue;
    }

    if (state === "block") {
      if (character === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else {
        output += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      output += character;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (
        (state === "single" && character === "'") ||
        (state === "double" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (character === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line";
    } else if (character === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block";
    } else {
      output += character;
      if (character === "'") state = "single";
      else if (character === '"') state = "double";
      else if (character === "`") state = "template";
    }
  }

  return output;
}

function sourceLineNumbers(source: string): number[] {
  return stripComments(source)
    .split(/\r?\n/)
    .map((line, index) => (line.trim() ? index + 1 : 0))
    .filter((line): line is number => line > 0);
}

function toRanges(lines: number[]): SourceLineRange[] {
  if (lines.length === 0) return [];
  const ranges: SourceLineRange[] = [];
  let start = lines[0];
  let end = lines[0];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === end + 1) {
      end = line;
    } else {
      ranges.push([start, end]);
      start = line;
      end = line;
    }
  }
  ranges.push([start, end]);
  return ranges;
}

type MappingReadResult =
  | { status: "loaded"; document: MappingDocument }
  | { status: "missing"; document: null }
  | { status: "invalid"; document: null; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCoveragePercent(value: unknown): value is number | null {
  return (
    value === null ||
    (isFiniteNonNegativeNumber(value) && value <= 100)
  );
}

function isLineList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((line) => Number.isInteger(line) && line > 0)
  );
}

function isLineRangeList(value: unknown): value is SourceLineRange[] {
  return (
    Array.isArray(value) &&
    value.every(
      (range) =>
        Array.isArray(range) &&
        range.length === 2 &&
        Number.isInteger(range[0]) &&
        Number.isInteger(range[1]) &&
        range[0] > 0 &&
        range[1] >= range[0]
    )
  );
}

/** Runtime guard for persisted per-run inventory snapshots. */
export function isCobraSourceInventory(
  value: unknown
): value is CobraSourceInventory {
  if (!isRecord(value) || !Array.isArray(value.roots) || !Array.isArray(value.files)) {
    return false;
  }
  if (!value.roots.every((root) => typeof root === "string")) return false;

  const validFiles = value.files.every(
    (file) =>
      isRecord(file) &&
      typeof file.path === "string" &&
      isFiniteNonNegativeNumber(file.totalLines) &&
      isLineList(file.touchedLines) &&
      isFiniteNonNegativeNumber(file.touchedLineCount) &&
      isLineList(file.uncoveredLines) &&
      isFiniteNonNegativeNumber(file.uncoveredLineCount) &&
      isLineRangeList(file.uncoveredRanges) &&
      isCoveragePercent(file.coveragePercent) &&
      Array.isArray(file.mappedTests) &&
      file.mappedTests.every((test) => typeof test === "string")
  );
  if (!validFiles || !isRecord(value.summary) || !isRecord(value.mapping)) {
    return false;
  }
  const summary = value.summary;
  const mapping = value.mapping;

  const summaryNumbers = [
    "totalFiles",
    "measuredFiles",
    "notApplicableFiles",
    "coveredFiles",
    "partiallyCoveredFiles",
    "fullyCoveredFiles",
    "uncoveredFiles",
    "totalLines",
    "touchedLines",
    "uncoveredLines",
    "mappedTests",
  ];
  if (
    !summaryNumbers.every((key) => isFiniteNonNegativeNumber(summary[key])) ||
    !isCoveragePercent(summary.coveragePercent)
  ) {
    return false;
  }

  const mappingNumbers = [
    "testCount",
    "mappedFileCount",
    "ignoredNonRepoFileCount",
  ];
  return (
    typeof mapping.ready === "boolean" &&
    ["ready", "missing", "invalid", "unmapped"].includes(
      String(mapping.status)
    ) &&
    typeof mapping.deploymentVerified === "boolean" &&
    mappingNumbers.every((key) => isFiniteNonNegativeNumber(mapping[key])) &&
    (mapping.error === undefined || typeof mapping.error === "string") &&
    (mapping.baselineRunId === undefined ||
      typeof mapping.baselineRunId === "string") &&
    (mapping.updatedAt === undefined || typeof mapping.updatedAt === "string")
  );
}

/** Runtime guard for `runs/<runId>/source-inventory.json`. */
export function isCobraSourceInventorySnapshot(
  value: unknown,
  expectedRunId?: string
): value is CobraSourceInventorySnapshot {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.runId === "string" &&
    (expectedRunId === undefined || value.runId === expectedRunId) &&
    typeof value.capturedAt === "string" &&
    typeof value.mappingArtifact === "string" &&
    isCobraSourceInventory(value.inventory)
  );
}

function isMappingDocument(value: unknown): value is MappingDocument {
  if (
    !isRecord(value) ||
    !Array.isArray(value.tests) ||
    (value.baselineRunId !== undefined && typeof value.baselineRunId !== "string") ||
    (value.deploymentVerified !== undefined &&
      typeof value.deploymentVerified !== "boolean") ||
    (value.updatedAt !== undefined && typeof value.updatedAt !== "string")
  ) {
    return false;
  }
  return value.tests.every(
    (test) =>
      isRecord(test) &&
      typeof test.testId === "string" &&
      Array.isArray(test.files) &&
      test.files.every(
        (file) =>
          isRecord(file) &&
          typeof file.path === "string" &&
          Array.isArray(file.linesTouched) &&
          file.linesTouched.every((line) => typeof line === "number")
      )
  );
}

function readMapping(file: string): MappingReadResult {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!isMappingDocument(parsed)) {
      return {
        status: "invalid",
        document: null,
        error: "Mapping JSON does not match the expected test/file structure",
      };
    }
    return { status: "loaded", document: parsed };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing", document: null };
    }
    return {
      status: "invalid",
      document: null,
      error: (error as Error).message || "Mapping JSON could not be read",
    };
  }
}

function roundedPercent(covered: number, total: number): number | null {
  return total > 0 ? Number(((covered / total) * 100).toFixed(2)) : null;
}

/** Builds a whole-repository source inventory and applies the latest mapping. */
export function buildCobraSourceInventory(
  options: SourceInventoryOptions = {}
): CobraSourceInventory {
  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const mappingFile =
    options.mappingFile ?? path.join(repoRoot, ".cobra", "mappings", "latest.json");
  const absoluteFiles: string[] = [];
  for (const root of SOURCE_ROOTS) {
    collectSourceFiles(path.join(repoRoot, root), absoluteFiles);
  }

  const eligibleLines = new Map<string, number[]>();
  for (const absoluteFile of absoluteFiles) {
    const repoPath = normalizeSlashes(path.relative(repoRoot, absoluteFile));
    eligibleLines.set(repoPath, sourceLineNumbers(fs.readFileSync(absoluteFile, "utf8")));
  }

  const mappingResult = readMapping(mappingFile);
  const mapping = mappingResult.document;
  const touchedByFile = new Map<string, Set<number>>();
  const testsByFile = new Map<string, Set<string>>();
  const allMappedTests = new Set<string>();
  let ignoredNonRepoFileCount = 0;

  for (const test of Array.isArray(mapping?.tests) ? mapping.tests : []) {
    if (!test || typeof test.testId !== "string" || !test.testId) continue;
    for (const file of Array.isArray(test.files) ? test.files : []) {
      if (!file || typeof file.path !== "string") continue;
      const repoPath = normalizeInventoryPath(file.path, repoRoot);
      if (!repoPath || !eligibleLines.has(repoPath)) {
        ignoredNonRepoFileCount += 1;
        continue;
      }
      allMappedTests.add(test.testId);
      const touched = touchedByFile.get(repoPath) ?? new Set<number>();
      for (const line of Array.isArray(file.linesTouched) ? file.linesTouched : []) {
        if (Number.isInteger(line) && line > 0) touched.add(line);
      }
      touchedByFile.set(repoPath, touched);
      const tests = testsByFile.get(repoPath) ?? new Set<string>();
      tests.add(test.testId);
      testsByFile.set(repoPath, tests);
    }
  }

  const files = [...eligibleLines.entries()]
    .map(([repoPath, lineNumbers]): CobraSourceInventoryFile => {
      const eligible = new Set(lineNumbers);
      const touchedLines = [...(touchedByFile.get(repoPath) ?? [])]
        .filter((line) => eligible.has(line))
        .sort((left, right) => left - right);
      const touched = new Set(touchedLines);
      const uncoveredLines = lineNumbers.filter((line) => !touched.has(line));
      return {
        path: repoPath,
        totalLines: lineNumbers.length,
        touchedLines,
        touchedLineCount: touchedLines.length,
        uncoveredLines,
        uncoveredLineCount: uncoveredLines.length,
        uncoveredRanges: toRanges(uncoveredLines),
        coveragePercent: roundedPercent(touchedLines.length, lineNumbers.length),
        mappedTests: [...(testsByFile.get(repoPath) ?? [])].sort(),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const totalLines = files.reduce((sum, file) => sum + file.totalLines, 0);
  const touchedLines = files.reduce((sum, file) => sum + file.touchedLineCount, 0);
  const measuredFiles = files.filter((file) => file.totalLines > 0).length;
  const coveredFiles = files.filter((file) => file.touchedLineCount > 0).length;
  const fullyCoveredFiles = files.filter(
    (file) => file.totalLines > 0 && file.touchedLineCount === file.totalLines
  ).length;
  const partiallyCoveredFiles = files.filter(
    (file) => file.touchedLineCount > 0 && file.touchedLineCount < file.totalLines
  ).length;

  return {
    roots: [...SOURCE_ROOTS],
    files,
    summary: {
      totalFiles: files.length,
      measuredFiles,
      notApplicableFiles: files.length - measuredFiles,
      coveredFiles,
      partiallyCoveredFiles,
      fullyCoveredFiles,
      uncoveredFiles: files.filter(
        (file) => file.totalLines > 0 && file.touchedLineCount === 0
      ).length,
      totalLines,
      touchedLines,
      uncoveredLines: Math.max(0, totalLines - touchedLines),
      coveragePercent: roundedPercent(touchedLines, totalLines),
      mappedTests: allMappedTests.size,
    },
    mapping: {
      ready: touchedByFile.size > 0,
      status:
        mappingResult.status === "missing"
          ? "missing"
          : mappingResult.status === "invalid"
            ? "invalid"
            : touchedByFile.size > 0
              ? "ready"
              : "unmapped",
      error: mappingResult.status === "invalid" ? mappingResult.error : undefined,
      deploymentVerified: mapping?.deploymentVerified === true,
      baselineRunId: mapping?.baselineRunId,
      updatedAt: mapping?.updatedAt,
      testCount: Array.isArray(mapping?.tests) ? mapping.tests.length : 0,
      mappedFileCount: touchedByFile.size,
      ignoredNonRepoFileCount,
    },
  };
}
