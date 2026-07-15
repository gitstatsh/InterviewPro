import { describe, expect, it } from "vitest";
import type { CobraMappingIndex } from "@interview/shared";
import { isSelectiveCobraMapping } from "../../../../scripts/cobra-runner.js";

function trustedMapping(): CobraMappingIndex {
  return {
    version: 1,
    baselineRunId: "hosted-baseline",
    baselineCommitSha: "a".repeat(40),
    deploymentVerified: true,
    coverageCapability: "source",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tests: [
      {
        testId: "candidate-page",
        sourceRunId: "hosted-baseline",
        updatedAt: "2026-01-01T00:00:00.000Z",
        status: "passed",
        files: [
          {
            path: "apps/web/src/app/candidates/page.tsx",
            functionsTouched: [],
            linesTouched: [10],
          },
        ],
        externalDeps: [],
        browserSourceMaps: {
          totalScripts: 2,
          resolvedHostedMaps: 2,
          resolvedLocalExactMaps: 0,
          unresolvedMaps: 0,
        },
      },
    ],
  };
}

describe("COBRA runner mapping trust", () => {
  it("accepts complete hosted source-line evidence", () => {
    expect(isSelectiveCobraMapping(trustedMapping())).toBe(true);
  });

  it.each([
    {
      label: "legacy missing diagnostics",
      mutate(value: CobraMappingIndex) {
        delete value.tests[0].browserSourceMaps;
      },
    },
    {
      label: "local-exact diagnostics",
      mutate(value: CobraMappingIndex) {
        value.tests[0].browserSourceMaps = {
          totalScripts: 2,
          resolvedHostedMaps: 1,
          resolvedLocalExactMaps: 1,
          unresolvedMaps: 0,
        };
      },
    },
    {
      label: "unresolved diagnostics",
      mutate(value: CobraMappingIndex) {
        value.tests[0].browserSourceMaps = {
          totalScripts: 2,
          resolvedHostedMaps: 1,
          resolvedLocalExactMaps: 0,
          unresolvedMaps: 1,
        };
      },
    },
    {
      label: "zero scripts",
      mutate(value: CobraMappingIndex) {
        value.tests[0].browserSourceMaps = {
          totalScripts: 0,
          resolvedHostedMaps: 0,
          resolvedLocalExactMaps: 0,
          unresolvedMaps: 0,
        };
      },
    },
    {
      label: "an unmapped passing test",
      mutate(value: CobraMappingIndex) {
        value.tests.push({
          ...value.tests[0],
          testId: "questions-page",
          files: [],
        });
      },
    },
    {
      label: "a repository path traversal",
      mutate(value: CobraMappingIndex) {
        value.tests[0].files[0].path =
          "apps/web/src/../../automationTestcase/login.spec.ts";
      },
    },
  ])("rejects $label", ({ mutate }) => {
    const mapping = trustedMapping();
    mutate(mapping);

    expect(isSelectiveCobraMapping(mapping)).toBe(false);
  });
});
