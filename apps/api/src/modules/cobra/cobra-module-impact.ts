import type {
  CobraChangedFile,
  CobraImpactDecision,
} from "@interview/shared";

export type CobraModuleTest = {
  id: string;
  specFile: string;
  tag: string;
};

export type CobraModuleRule = {
  name: string;
  paths: string[];
  tests: string[];
};

export type CobraModuleMap = {
  version: 1;
  tests: CobraModuleTest[];
  modules: CobraModuleRule[];
  fullRegressionPaths: string[];
  ignoredPaths: string[];
};

export type CobraModuleImpactResult = {
  decision: CobraImpactDecision;
  selectedTests: CobraModuleTest[];
  matchedModules: string[];
  ignoredFiles: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeModulePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
}

function validatePattern(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const normalized = normalizeModulePath(value);
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`${label} must be a repository-relative glob`);
  }
  return normalized;
}

function validatePatterns(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => validatePattern(entry, `${label}[${index}]`));
}

export function parseCobraModuleMap(value: unknown): CobraModuleMap {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("COBRA module map must be an object with version 1");
  }
  if (!Array.isArray(value.tests) || value.tests.length === 0) {
    throw new Error("COBRA module map must register at least one test");
  }

  const testIds = new Set<string>();
  const tags = new Set<string>();
  const tests = value.tests.map((entry, index): CobraModuleTest => {
    if (!isRecord(entry)) throw new Error(`tests[${index}] must be an object`);
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const specFile =
      typeof entry.specFile === "string" ? normalizeModulePath(entry.specFile) : "";
    const tag = typeof entry.tag === "string" ? entry.tag.trim() : "";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`tests[${index}].id must be a lowercase stable identifier`);
    }
    if (
      !specFile.startsWith("automationTestcase/") ||
      !specFile.endsWith(".spec.ts") ||
      specFile.split("/").includes("..")
    ) {
      throw new Error(`tests[${index}].specFile must be an automationTestcase spec`);
    }
    if (!/^@cobra:[a-z0-9][a-z0-9-]*$/.test(tag)) {
      throw new Error(`tests[${index}].tag must use the @cobra:<name> format`);
    }
    if (testIds.has(id)) throw new Error(`Duplicate COBRA module test id: ${id}`);
    if (tags.has(tag)) throw new Error(`Duplicate COBRA module test tag: ${tag}`);
    testIds.add(id);
    tags.add(tag);
    return { id, specFile, tag };
  });

  if (!Array.isArray(value.modules) || value.modules.length === 0) {
    throw new Error("COBRA module map must define at least one module");
  }
  const moduleNames = new Set<string>();
  const modules = value.modules.map((entry, index): CobraModuleRule => {
    if (!isRecord(entry)) throw new Error(`modules[${index}] must be an object`);
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) throw new Error(`modules[${index}].name is required`);
    if (moduleNames.has(name)) throw new Error(`Duplicate COBRA module name: ${name}`);
    moduleNames.add(name);
    const paths = validatePatterns(entry.paths, `modules[${index}].paths`);
    if (paths.length === 0) throw new Error(`Module ${name} must map at least one path`);
    if (!Array.isArray(entry.tests) || entry.tests.length === 0) {
      throw new Error(`Module ${name} must select at least one test`);
    }
    const selected = entry.tests.map((testId, testIndex) => {
      if (typeof testId !== "string" || !testIds.has(testId)) {
        throw new Error(`modules[${index}].tests[${testIndex}] references an unknown test`);
      }
      return testId;
    });
    return { name, paths, tests: [...new Set(selected)] };
  });

  return {
    version: 1,
    tests,
    modules,
    fullRegressionPaths: validatePatterns(
      value.fullRegressionPaths,
      "fullRegressionPaths"
    ),
    ignoredPaths: validatePatterns(value.ignoredPaths, "ignoredPaths"),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globRegex(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += escapeRegex(character);
    }
  }
  return new RegExp(`${expression}$`);
}

export function modulePathMatches(path: string, pattern: string): boolean {
  return globRegex(normalizeModulePath(pattern)).test(normalizeModulePath(path));
}

function normalizedChanges(input: CobraChangedFile[]): CobraChangedFile[] {
  return input.map((file) => ({
    ...file,
    path: normalizeModulePath(file.path),
    ...(file.oldPath ? { oldPath: normalizeModulePath(file.oldPath) } : {}),
    lines: [...new Set(file.lines.filter((line) => Number.isInteger(line) && line > 0))].sort(
      (left, right) => left - right
    ),
  }));
}

export function fullModuleRegressionDecision(
  map: CobraModuleMap,
  changedFiles: CobraChangedFile[],
  unmappedFiles: string[] = changedFiles.map((file) => file.path)
): CobraImpactDecision {
  return {
    mode: "full-regression",
    reason: "unmapped-change",
    changedFiles,
    recommendedTests: map.tests.map((test) => test.id).sort(),
    skippedTests: [],
    unmappedFiles: [...new Set(unmappedFiles.map(normalizeModulePath))].sort(),
  };
}

/**
 * Selects stable automation tags from repository paths only. This is the
 * deployment-independent fallback: unknown/shared paths always run the suite.
 */
export function analyzeModuleImpact(
  map: CobraModuleMap,
  input: CobraChangedFile[]
): CobraModuleImpactResult {
  const changedFiles = normalizedChanges(input);
  const allIds = map.tests.map((test) => test.id).sort();
  if (changedFiles.length === 0) {
    return {
      decision: {
        mode: "impacted",
        reason: "no-changes",
        changedFiles,
        recommendedTests: [],
        skippedTests: allIds,
        unmappedFiles: [],
      },
      selectedTests: [],
      matchedModules: [],
      ignoredFiles: [],
    };
  }

  const selectedIds = new Set<string>();
  const matchedModules = new Set<string>();
  const ignoredFiles = new Set<string>();
  const unsafeFiles = new Set<string>();

  for (const change of changedFiles) {
    const paths = [...new Set([change.path, change.oldPath].filter((path): path is string => Boolean(path)))];
    let changeMapped = false;
    for (const changedPath of paths) {
      if (map.fullRegressionPaths.some((pattern) => modulePathMatches(changedPath, pattern))) {
        unsafeFiles.add(changedPath);
        continue;
      }
      if (map.ignoredPaths.some((pattern) => modulePathMatches(changedPath, pattern))) {
        ignoredFiles.add(changedPath);
        changeMapped = true;
        continue;
      }

      const matches = map.modules.filter((module) =>
        module.paths.some((pattern) => modulePathMatches(changedPath, pattern))
      );
      if (matches.length === 0) {
        unsafeFiles.add(changedPath);
        continue;
      }
      changeMapped = true;
      for (const module of matches) {
        matchedModules.add(module.name);
        module.tests.forEach((testId) => selectedIds.add(testId));
      }
    }
    if (!changeMapped && paths.length === 0) unsafeFiles.add(change.path);
  }

  if (unsafeFiles.size > 0) {
    return {
      decision: fullModuleRegressionDecision(map, changedFiles, [...unsafeFiles]),
      selectedTests: [...map.tests].sort((left, right) => left.id.localeCompare(right.id)),
      matchedModules: [...matchedModules].sort(),
      ignoredFiles: [...ignoredFiles].sort(),
    };
  }

  const selectedTests = map.tests
    .filter((test) => selectedIds.has(test.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const selected = new Set(selectedTests.map((test) => test.id));
  return {
    decision: {
      mode: "impacted",
      reason: selectedTests.length > 0 ? "mapped-change" : "no-changes",
      changedFiles,
      recommendedTests: selectedTests.map((test) => test.id),
      skippedTests: allIds.filter((testId) => !selected.has(testId)),
      unmappedFiles: [],
    },
    selectedTests,
    matchedModules: [...matchedModules].sort(),
    ignoredFiles: [...ignoredFiles].sort(),
  };
}
