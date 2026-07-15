import type {
  CobraChangedFile,
  CobraImpactDecision,
  CobraMappingIndex,
} from "@interview/shared";

export function normalizeRepoPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
}

type ChangedFileWithHistory = CobraChangedFile & {
  oldPath?: string;
  oldLines?: number[];
  structuralChange?: boolean;
};

function normalizeLines(lines: number[]): number[] {
  return [...new Set(lines.filter((line) => Number.isInteger(line) && line > 0))]
    .sort((left, right) => left - right);
}

export function analyzeImpact(
  mapping: CobraMappingIndex | null,
  input: CobraChangedFile[]
): CobraImpactDecision {
  const changedFiles = input.map((inputFile) => {
    const file = inputFile as ChangedFileWithHistory;
    return {
      ...file,
      path: normalizeRepoPath(file.path),
      ...(file.oldPath ? { oldPath: normalizeRepoPath(file.oldPath) } : {}),
      lines: normalizeLines(file.lines),
      ...(file.oldLines ? { oldLines: normalizeLines(file.oldLines) } : {}),
    };
  });

  if (changedFiles.length === 0) {
    const allTests = mapping?.tests.map((test) => test.testId).sort() ?? [];
    return {
      mode: "impacted",
      reason: "no-changes",
      changedFiles,
      recommendedTests: [],
      skippedTests: allTests,
      unmappedFiles: [],
    };
  }

  if (!mapping || mapping.tests.length === 0) {
    return {
      mode: "full-regression",
      reason: "mapping-missing",
      changedFiles,
      recommendedTests: [],
      skippedTests: [],
      unmappedFiles: changedFiles.map((file) => file.path),
    };
  }

  const allTests = [...new Set(mapping.tests.map((test) => test.testId))].sort();
  const recommended = new Set<string>();
  const unmappedFiles = new Set<string>();

  for (const changed of changedFiles) {
    // A whole-file change has no trustworthy line boundary. Deleted and
    // renamed files likewise need import/dependency analysis that the current
    // mapping does not provide. In each case, select the safe full suite.
    if (
      changed.lines.length === 0 ||
      changed.status === "deleted" ||
      changed.status === "renamed" ||
      changed.status === "added" ||
      changed.structuralChange === true ||
      (changed.oldLines !== undefined &&
        changed.oldLines.length !== changed.lines.length)
    ) {
      unmappedFiles.add(changed.path);
      continue;
    }

    // A promoted mapping describes the base revision. When Git provides
    // old-side lines, match those coordinates; unequal old/new hunk sizes
    // above are treated as new/removed code and force the safe full suite.
    const linesToMatch = changed.oldLines ?? changed.lines;
    let everyLineMapped = true;
    for (const changedLine of linesToMatch) {
      let lineMapped = false;
      for (const test of mapping.tests) {
        const touched = test.files.some(
          (file) =>
            normalizeRepoPath(file.path) === changed.path &&
            file.linesTouched.includes(changedLine)
        );
        if (!touched) continue;
        lineMapped = true;
        recommended.add(test.testId);
      }
      if (!lineMapped) everyLineMapped = false;
    }
    if (!everyLineMapped) unmappedFiles.add(changed.path);
  }

  if (unmappedFiles.size > 0) {
    return {
      mode: "full-regression",
      reason: "unmapped-change",
      changedFiles,
      recommendedTests: allTests,
      skippedTests: [],
      unmappedFiles: [...unmappedFiles].sort(),
    };
  }

  const recommendedTests = [...recommended].sort();
  const selected = new Set(recommendedTests);
  return {
    mode: "impacted",
    reason: "mapped-change",
    changedFiles,
    recommendedTests,
    skippedTests: allTests.filter((testId) => !selected.has(testId)),
    unmappedFiles: [],
  };
}
