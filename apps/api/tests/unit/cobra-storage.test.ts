import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
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

  beforeAll(async () => {
    mockEnvironment.storage = storage;
    vi.resetModules();
    ({ refreshMappingFromRun } = await import(
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
        files: [
          {
            path: `apps/web/src/feature-${index}.ts`,
            functionsTouched: [],
            linesTouched: [1],
          },
        ],
        externalDeps: [],
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
