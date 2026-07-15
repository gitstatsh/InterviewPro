import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  CobraMappingIndex,
  CobraTestStatus,
  PerTestCoverage,
  RunIndex,
} from "@interview/shared";

const mockEnvironment = vi.hoisted(() => ({ storage: "" }));

vi.mock("../../src/config/env.js", () => ({
  env: { COBRA_STORAGE_DIR: mockEnvironment.storage },
}));

describe("COBRA mapping refresh validation", () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "cobra-api-storage-"));
  let refreshMappingFromRun: typeof import("../../src/modules/cobra/cobra.storage")["refreshMappingFromRun"];
  let readTrustedMapping: typeof import("../../src/modules/cobra/cobra.storage")["readTrustedMapping"];

  beforeAll(async () => {
    mockEnvironment.storage = storage;
    vi.resetModules();
    ({ refreshMappingFromRun, readTrustedMapping } = await import(
      "../../src/modules/cobra/cobra.storage"
    ));
  });

  afterAll(() => {
    fs.rmSync(storage, { recursive: true, force: true });
  });

  function writeBaseline(
    runId: string,
    options: {
      expectedTestCount?: number;
      statuses?: CobraTestStatus[];
      omitDocuments?: boolean;
      browserMapDiagnostics?:
        | PerTestCoverage["browserSourceMaps"]
        | "missing";
      unmappedTestIndexes?: number[];
    } = {}
  ): void {
    const statuses = options.statuses ?? ["passed"];
    const runDirectory = path.join(storage, "runs", runId);
    fs.mkdirSync(runDirectory, { recursive: true });
    const tests = statuses.map((status, index) => ({
      testId: `test-${index}`,
      stableTestId: `stable-${index}`,
      file: `test-${index}.json`,
      status,
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      fileCount: 1,
      externalDepCount: 0,
    }));
    const run: RunIndex = {
      runId,
      kind: "baseline",
      status: "passed",
      expectedTestCount: options.expectedTestCount ?? statuses.length,
      createdAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      commitSha: "a".repeat(40),
      deploymentVerified: true,
      tests,
    };
    fs.writeFileSync(
      path.join(runDirectory, "index.json"),
      JSON.stringify(run)
    );

    if (options.omitDocuments) return;
    for (let index = 0; index < tests.length; index += 1) {
      const document: PerTestCoverage = {
        testId: tests[index].testId,
        stableTestId: tests[index].stableTestId,
        runId,
        startedAt: "2026-01-01T00:00:00.000Z",
        durationMs: 1,
        files: options.unmappedTestIndexes?.includes(index)
          ? []
          : [
              {
                path: `apps/web/src/feature-${index}.ts`,
                functionsTouched: [],
                linesTouched: [1],
              },
            ],
        externalDeps: [],
        browserChunks: [
          {
            url: "https://app.example/_next/static/chunks/feature.js",
            script: "/_next/static/chunks/feature.js",
            totalBytes: 100,
            coveredBytes: 50,
            coveragePercent: 50,
            coveredRanges: [[0, 50] as [number, number]],
          },
        ],
        ...(options.browserMapDiagnostics === "missing"
          ? {}
          : {
              browserSourceMaps: options.browserMapDiagnostics ?? {
                totalScripts: 1,
                resolvedHostedMaps: 1,
                resolvedLocalExactMaps: 0,
                unresolvedMaps: 0,
              },
            }),
      };
      fs.writeFileSync(
        path.join(runDirectory, tests[index].file),
        JSON.stringify(document)
      );
    }
  }

  it("refreshes a complete all-passing baseline", () => {
    writeBaseline("valid-baseline");

    const mapping = refreshMappingFromRun("valid-baseline");

    expect(mapping.baselineRunId).toBe("valid-baseline");
    expect(mapping.tests).toHaveLength(1);
    expect(mapping.coverageCapability).toBe("source");
    expect(readTrustedMapping()?.baselineRunId).toBe("valid-baseline");
  });

  it("rejects a legacy trusted file that lacks per-test hosted diagnostics", () => {
    writeBaseline("valid-baseline");
    const mapping = refreshMappingFromRun("valid-baseline");
    const legacy = structuredClone(mapping) as CobraMappingIndex;
    delete legacy.tests[0].browserSourceMaps;
    const trustedFile = path.join(storage, "mappings", "trusted.json");
    fs.writeFileSync(trustedFile, JSON.stringify(legacy));

    expect(readTrustedMapping()).toBeNull();

    fs.writeFileSync(trustedFile, JSON.stringify(mapping));
  });

  it("keeps a baseline mixed when one expected passing test has no source lines", () => {
    writeBaseline("valid-baseline");
    refreshMappingFromRun("valid-baseline");
    writeBaseline("partly-unmapped", {
      statuses: ["passed", "passed"],
      unmappedTestIndexes: [1],
    });

    const mapping = refreshMappingFromRun("partly-unmapped");

    expect(mapping.coverageCapability).toBe("mixed");
    expect(readTrustedMapping()?.baselineRunId).toBe("valid-baseline");
  });

  it("does not classify complete local-exact maps as trusted source coverage", () => {
    writeBaseline("local-browser-maps", {
      browserMapDiagnostics: {
        totalScripts: 1,
        resolvedHostedMaps: 0,
        resolvedLocalExactMaps: 1,
        unresolvedMaps: 0,
      },
    });

    const mapping = refreshMappingFromRun("local-browser-maps");

    expect(mapping.coverageCapability).toBe("mixed");
    expect(mapping.tests[0].browserSourceMaps?.resolvedLocalExactMaps).toBe(1);
  });

  it.each([
    ["missing", "missing" as const],
    [
      "zero",
      {
        totalScripts: 0,
        resolvedHostedMaps: 0,
        resolvedLocalExactMaps: 0,
        unresolvedMaps: 0,
      },
    ],
    [
      "invalid",
      {
        totalScripts: 1,
        resolvedHostedMaps: 1,
        resolvedLocalExactMaps: 0,
        unresolvedMaps: 1,
      },
    ],
  ])("keeps %s browser diagnostics mixed", (label, diagnostics) => {
    const runId = `${label}-browser-diagnostics`;
    writeBaseline(runId, { browserMapDiagnostics: diagnostics });

    expect(refreshMappingFromRun(runId).coverageCapability).toBe("mixed");
  });

  it("rejects a baseline whose recorded count differs from discovery", () => {
    writeBaseline("count-mismatch", { expectedTestCount: 2 });

    expect(() => refreshMappingFromRun("count-mismatch")).toThrow(
      /recorded 1 of 2 expected tests/
    );
  });

  it("rejects a baseline containing a non-passing test", () => {
    writeBaseline("skipped-baseline", { statuses: ["skipped"] });

    expect(() => refreshMappingFromRun("skipped-baseline")).toThrow(
      /contains a skipped test/
    );
  });

  it("rejects a baseline with a missing per-test document", () => {
    writeBaseline("missing-document", { omitDocuments: true });

    expect(() => refreshMappingFromRun("missing-document")).toThrow(
      /is missing test-0.json/
    );
  });
});
