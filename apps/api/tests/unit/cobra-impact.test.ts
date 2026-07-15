import { describe, expect, it } from "vitest";
import type { CobraMappingIndex } from "@interview/shared";
import { analyzeImpact } from "../../src/modules/cobra/cobra-impact";

const mapping: CobraMappingIndex = {
  version: 1,
  baselineRunId: "baseline-1",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
  tests: [
    {
      testId: "candidates.spec.ts > creates a candidate",
      specFile: "apps/web/tests/e2e/candidates.spec.ts",
      sourceRunId: "baseline-1",
      updatedAt: "2026-07-14T00:00:00.000Z",
      status: "passed",
      files: [
        {
          path: "apps/api/src/modules/candidates/candidates.service.ts",
          functionsTouched: ["createCandidate"],
          linesTouched: [20, 21, 22],
        },
      ],
      externalDeps: [],
    },
    {
      testId: "auth.spec.ts > signs in",
      specFile: "apps/web/tests/e2e/auth.spec.ts",
      sourceRunId: "baseline-1",
      updatedAt: "2026-07-14T00:00:00.000Z",
      status: "passed",
      files: [
        {
          path: "apps/api/src/modules/auth/auth.routes.ts",
          functionsTouched: [],
          linesTouched: [10, 11],
        },
      ],
      externalDeps: [],
    },
  ],
};

describe("analyzeImpact", () => {
  it("selects only tests mapped to the changed lines", () => {
    const result = analyzeImpact(mapping, [
      {
        path: "apps\\api\\src\\modules\\candidates\\candidates.service.ts",
        status: "modified",
        lines: [21],
      },
    ]);

    expect(result.mode).toBe("impacted");
    expect(result.recommendedTests).toEqual([
      "candidates.spec.ts > creates a candidate",
    ]);
    expect(result.skippedTests).toEqual(["auth.spec.ts > signs in"]);
  });

  it("falls back to full regression for an unmapped new file", () => {
    const result = analyzeImpact(mapping, [
      { path: "apps/api/src/new-feature.ts", status: "added", lines: [1] },
    ]);

    expect(result.mode).toBe("full-regression");
    expect(result.reason).toBe("unmapped-change");
    expect(result.unmappedFiles).toEqual(["apps/api/src/new-feature.ts"]);
    expect(result.recommendedTests).toHaveLength(2);
  });

  it("falls back when no baseline mapping exists", () => {
    const result = analyzeImpact(null, [
      { path: "apps/api/src/app.ts", status: "modified", lines: [] },
    ]);

    expect(result.mode).toBe("full-regression");
    expect(result.reason).toBe("mapping-missing");
  });

  it("falls back when even one changed line is not mapped", () => {
    const result = analyzeImpact(mapping, [
      {
        path: "apps/api/src/modules/candidates/candidates.service.ts",
        status: "modified",
        lines: [21, 999],
      },
    ]);

    expect(result.mode).toBe("full-regression");
    expect(result.reason).toBe("unmapped-change");
    expect(result.recommendedTests).toEqual([
      "auth.spec.ts > signs in",
      "candidates.spec.ts > creates a candidate",
    ]);
    expect(result.unmappedFiles).toEqual([
      "apps/api/src/modules/candidates/candidates.service.ts",
    ]);
  });

  it("matches base-revision old lines when Git supplies both sides", () => {
    const result = analyzeImpact(mapping, [
      {
        path: "apps/api/src/modules/candidates/candidates.service.ts",
        status: "modified",
        lines: [121],
        oldLines: [21],
      },
    ]);

    expect(result.mode).toBe("impacted");
    expect(result.recommendedTests).toEqual([
      "candidates.spec.ts > creates a candidate",
    ]);
  });

  it("falls back when a hunk adds or removes source lines", () => {
    const result = analyzeImpact(mapping, [
      {
        path: "apps/api/src/modules/candidates/candidates.service.ts",
        status: "modified",
        lines: [21, 22],
        oldLines: [21],
      },
    ]);

    expect(result.mode).toBe("full-regression");
    expect(result.reason).toBe("unmapped-change");
  });

  it("falls back when structural hunks have cancelling aggregate counts", () => {
    const result = analyzeImpact(mapping, [
      {
        path: "apps/api/src/modules/candidates/candidates.service.ts",
        status: "modified",
        lines: [20, 21],
        oldLines: [20, 21],
        structuralChange: true,
      },
    ]);

    expect(result.mode).toBe("full-regression");
    expect(result.reason).toBe("unmapped-change");
  });

  it("unions tests when different tests map every changed line", () => {
    const splitMapping: CobraMappingIndex = {
      ...mapping,
      tests: [
        ...mapping.tests,
        {
          testId: "candidate-details.spec.ts > reads a candidate",
          specFile: "apps/web/tests/e2e/candidate-details.spec.ts",
          sourceRunId: "baseline-1",
          updatedAt: "2026-07-14T00:00:00.000Z",
          status: "passed",
          files: [
            {
              path: "apps/api/src/modules/candidates/candidates.service.ts",
              functionsTouched: ["readCandidate"],
              linesTouched: [30],
            },
          ],
          externalDeps: [],
        },
      ],
    };

    const result = analyzeImpact(splitMapping, [
      {
        path: "apps/api/src/modules/candidates/candidates.service.ts",
        status: "modified",
        lines: [21, 30],
      },
    ]);

    expect(result.mode).toBe("impacted");
    expect(result.recommendedTests).toEqual([
      "candidate-details.spec.ts > reads a candidate",
      "candidates.spec.ts > creates a candidate",
    ]);
    expect(result.skippedTests).toEqual(["auth.spec.ts > signs in"]);
  });

  it("treats an empty line list as an unsafe whole-file change", () => {
    const result = analyzeImpact(mapping, [
      {
        path: "apps/api/src/modules/candidates/candidates.service.ts",
        status: "modified",
        lines: [],
      },
    ]);

    expect(result.mode).toBe("full-regression");
    expect(result.reason).toBe("unmapped-change");
    expect(result.unmappedFiles).toEqual([
      "apps/api/src/modules/candidates/candidates.service.ts",
    ]);
  });

  it.each([
    {
      status: "deleted" as const,
      path: "apps/api/src/modules/candidates/candidates.service.ts",
      lines: [21],
      oldLines: [21],
    },
    {
      status: "renamed" as const,
      path: "apps/api/src/modules/candidates/candidate.service.ts",
      oldPath: "apps/api/src/modules/candidates/candidates.service.ts",
      lines: [21],
      oldLines: [21],
    },
  ])("runs full regression for a $status file", (change) => {
    const result = analyzeImpact(mapping, [change]);

    expect(result.mode).toBe("full-regression");
    expect(result.reason).toBe("unmapped-change");
    expect(result.recommendedTests).toHaveLength(mapping.tests.length);
  });

  it("normalizes paths and line arrays before analysis", () => {
    const result = analyzeImpact(mapping, [
      {
        path: ".\\apps\\api\\src\\modules\\candidates\\candidates.service.ts",
        status: "modified",
        lines: [22, -1, 22, 20, 0],
        oldLines: [22, 20, 22, -2],
      },
    ]);

    expect(result.mode).toBe("impacted");
    expect(result.changedFiles).toEqual([
      {
        path: "apps/api/src/modules/candidates/candidates.service.ts",
        status: "modified",
        lines: [20, 22],
        oldLines: [20, 22],
      },
    ]);
  });

  it("returns no recommendations when there are no changes", () => {
    const result = analyzeImpact(mapping, []);

    expect(result).toMatchObject({
      mode: "impacted",
      reason: "no-changes",
      recommendedTests: [],
      skippedTests: [
        "auth.spec.ts > signs in",
        "candidates.spec.ts > creates a candidate",
      ],
      unmappedFiles: [],
    });
  });

});
