import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CobraMappingIndex, PerTestCoverage } from "./cobra-shape";

describe("COBRA baseline publication", () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "cobra-persist-"));
  let persistence: typeof import("./cobra-persist");

  beforeAll(async () => {
    process.env.COBRA_STORAGE_DIR = storage;
    vi.resetModules();
    persistence = await import("./cobra-persist");
  });

  afterAll(() => {
    delete process.env.COBRA_STORAGE_DIR;
    fs.rmSync(storage, { recursive: true, force: true });
  });

  it("does not erase the published mapping when a baseline starts", () => {
    const mappingFile = path.join(storage, "mappings", "latest.json");
    fs.mkdirSync(path.dirname(mappingFile), { recursive: true });
    const existing: CobraMappingIndex = {
      version: 1,
      baselineRunId: "previous-good-run",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tests: [],
    };
    fs.writeFileSync(mappingFile, JSON.stringify(existing));

    persistence.initRun("new-run", "baseline", { expectedTestCount: 1 });

    expect(
      (JSON.parse(fs.readFileSync(mappingFile, "utf8")) as CobraMappingIndex)
        .baselineRunId
    ).toBe("previous-good-run");
  });

  it("retains the previous mapping when the baseline is incomplete", () => {
    expect(() => persistence.finalizeRun("new-run")).toThrow(
      /was not promoted/
    );
    const mapping = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
    ) as CobraMappingIndex;
    expect(mapping.baselineRunId).toBe("previous-good-run");
  });

  it("atomically promotes a complete successful baseline", () => {
    persistence.initRun("complete-run", "baseline", {
      commitSha: "abc123",
      deploymentVerified: true,
      expectedTestCount: 1,
    });
    const document: PerTestCoverage = {
      testId: "navigation.spec.ts > loads candidates",
      stableTestId: "stable-navigation-id",
      titlePath: ["navigation.spec.ts", "loads candidates"],
      projectName: "chromium",
      runId: "complete-run",
      specFile: "automationTestcase/navigation.spec.ts",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 25,
      files: [
        {
          path: "apps/web/src/app/candidates/page.tsx",
          functionsTouched: ["CandidatesPage"],
          linesTouched: [10, 11],
        },
      ],
      externalDeps: [],
      browserSourceMaps: {
        totalScripts: 1,
        resolvedHostedMaps: 1,
        resolvedLocalExactMaps: 0,
        unresolvedMaps: 0,
      },
    };
    persistence.writePerTest("complete-run", document, "passed");

    persistence.finalizeRun("complete-run");

    const mapping = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
    ) as CobraMappingIndex;
    expect(mapping.baselineRunId).toBe("complete-run");
    expect(mapping.baselineCommitSha).toBe("abc123");
    expect(mapping.coverageCapability).toBe("source");
    expect(mapping.tests[0].stableTestId).toBe("stable-navigation-id");
  });

  it("keeps complete local-exact browser maps mixed and untrusted", () => {
    persistence.initRun("partial-source-run", "baseline", {
      commitSha: "partial123",
      deploymentVerified: true,
      expectedTestCount: 1,
    });
    const document: PerTestCoverage = {
      testId: "navigation.spec.ts > partial source maps",
      stableTestId: "stable-partial-source-id",
      runId: "partial-source-run",
      specFile: "automationTestcase/navigation.spec.ts",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 10,
      files: [
        {
          path: "apps/web/src/app/candidates/page.tsx",
          functionsTouched: ["CandidatesPage"],
          linesTouched: [10],
        },
      ],
      externalDeps: [],
      browserChunks: [
        {
          url: "https://app.example/_next/static/chunks/candidates.js",
          script: "/_next/static/chunks/candidates.js",
          totalBytes: 100,
          coveredBytes: 50,
          coveragePercent: 50,
          coveredRanges: [[0, 50]],
        },
      ],
      browserSourceMaps: {
        totalScripts: 1,
        resolvedHostedMaps: 0,
        resolvedLocalExactMaps: 1,
        unresolvedMaps: 0,
      },
    };
    persistence.writePerTest("partial-source-run", document, "passed");
    persistence.finalizeRun("partial-source-run");

    const latest = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
    ) as CobraMappingIndex;
    const trusted = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "trusted.json"), "utf8")
    ) as CobraMappingIndex;
    expect(latest.coverageCapability).toBe("mixed");
    expect(latest.tests[0].browserSourceMaps?.resolvedLocalExactMaps).toBe(1);
    expect(trusted.baselineRunId).toBe("complete-run");
  });

  it("keeps a baseline mixed when any passing test has no repository source lines", () => {
    persistence.initRun("partly-unmapped-run", "baseline", {
      commitSha: "partly-unmapped",
      deploymentVerified: true,
      expectedTestCount: 2,
    });
    const common = {
      runId: "partly-unmapped-run",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      externalDeps: [],
      browserSourceMaps: {
        totalScripts: 1,
        resolvedHostedMaps: 1,
        resolvedLocalExactMaps: 0,
        unresolvedMaps: 0,
      },
    } satisfies Partial<PerTestCoverage>;
    persistence.writePerTest(
      "partly-unmapped-run",
      {
        ...common,
        testId: "mapped test",
        stableTestId: "mapped-test",
        files: [
          {
            path: "apps/web/src/app/candidates/page.tsx",
            functionsTouched: [],
            linesTouched: [10],
          },
        ],
      } as PerTestCoverage,
      "passed"
    );
    persistence.writePerTest(
      "partly-unmapped-run",
      {
        ...common,
        testId: "unmapped test",
        stableTestId: "unmapped-test",
        files: [],
      } as PerTestCoverage,
      "passed"
    );

    persistence.finalizeRun("partly-unmapped-run");

    const latest = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
    ) as CobraMappingIndex;
    const trusted = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "trusted.json"), "utf8")
    ) as CobraMappingIndex;
    expect(latest.coverageCapability).toBe("mixed");
    expect(trusted.baselineRunId).toBe("complete-run");
  });

  it("treats missing, zero, and inconsistent browser diagnostics as mixed", () => {
    const cases: Array<{
      runId: string;
      diagnostics?: PerTestCoverage["browserSourceMaps"];
    }> = [
      {
        runId: "missing-browser-diagnostics",
      },
      {
        runId: "zero-browser-diagnostics",
        diagnostics: {
          totalScripts: 0,
          resolvedHostedMaps: 0,
          resolvedLocalExactMaps: 0,
          unresolvedMaps: 0,
        },
      },
      {
        runId: "invalid-browser-diagnostics",
        diagnostics: {
          totalScripts: 1,
          resolvedHostedMaps: 1,
          resolvedLocalExactMaps: 0,
          unresolvedMaps: 1,
        },
      },
    ];

    for (const item of cases) {
      persistence.initRun(item.runId, "baseline", {
        commitSha: item.runId,
        deploymentVerified: true,
        expectedTestCount: 1,
      });
      const document: PerTestCoverage = {
        testId: `navigation.spec.ts > ${item.runId}`,
        stableTestId: `stable-${item.runId}`,
        runId: item.runId,
        startedAt: "2026-01-01T00:00:00.000Z",
        durationMs: 1,
        files: [
          {
            path: "apps/web/src/app/candidates/page.tsx",
            functionsTouched: [],
            linesTouched: [1],
          },
        ],
        externalDeps: [],
        browserChunks: [
          {
            url: "https://app.example/_next/static/chunks/candidates.js",
            script: "/_next/static/chunks/candidates.js",
            totalBytes: 10,
            coveredBytes: 10,
            coveragePercent: 100,
            coveredRanges: [[0, 10]],
          },
        ],
        ...(item.diagnostics
          ? { browserSourceMaps: item.diagnostics }
          : {}),
      };
      persistence.writePerTest(item.runId, document, "passed");
      persistence.finalizeRun(item.runId);
      const mapping = JSON.parse(
        fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
      ) as CobraMappingIndex;
      expect(mapping.coverageCapability, item.runId).toBe("mixed");
    }

    const trusted = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "trusted.json"), "utf8")
    ) as CobraMappingIndex;
    expect(trusted.baselineRunId).toBe("complete-run");
  });

  it("keeps the last trusted mapping when a diagnostic baseline is unverified", () => {
    persistence.initRun("diagnostic-run", "baseline", {
      commitSha: "def789",
      deploymentVerified: false,
      expectedTestCount: 1,
    });
    const document: PerTestCoverage = {
      testId: "navigation.spec.ts > diagnostic",
      stableTestId: "stable-diagnostic-id",
      runId: "diagnostic-run",
      specFile: "automationTestcase/navigation.spec.ts",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      files: [],
      externalDeps: [],
    };
    persistence.writePerTest("diagnostic-run", document, "passed");
    persistence.finalizeRun("diagnostic-run");

    const latest = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
    ) as CobraMappingIndex;
    const trusted = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "trusted.json"), "utf8")
    ) as CobraMappingIndex;
    expect(latest.baselineRunId).toBe("diagnostic-run");
    expect(latest.coverageCapability).toBe("generated-only");
    expect(trusted.baselineRunId).toBe("complete-run");
  });

  it("does not promote a baseline containing a skipped test", () => {
    persistence.initRun("skipped-run", "baseline", {
      commitSha: "def456",
      expectedTestCount: 1,
    });
    const document: PerTestCoverage = {
      testId: "navigation.spec.ts > conditional test",
      stableTestId: "stable-skipped-id",
      runId: "skipped-run",
      specFile: "automationTestcase/navigation.spec.ts",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      files: [],
      externalDeps: [],
    };
    persistence.writePerTest("skipped-run", document, "skipped");

    expect(() => persistence.finalizeRun("skipped-run")).toThrow(
      /did not pass/
    );

    const index = JSON.parse(
      fs.readFileSync(path.join(storage, "runs", "skipped-run", "index.json"), "utf8")
    );
    const mapping = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
    ) as CobraMappingIndex;
    expect(index.status).toBe("failed");
    expect(mapping.baselineRunId).toBe("diagnostic-run");
  });

  it("marks a baseline failed when promotion validation finds a missing document", () => {
    persistence.initRun("missing-document-run", "baseline", {
      commitSha: "987abc",
      expectedTestCount: 1,
    });
    const document: PerTestCoverage = {
      testId: "navigation.spec.ts > missing artifact",
      stableTestId: "stable-missing-id",
      runId: "missing-document-run",
      specFile: "automationTestcase/navigation.spec.ts",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      files: [],
      externalDeps: [],
    };
    persistence.writePerTest("missing-document-run", document, "passed");
    const indexFile = path.join(
      storage,
      "runs",
      "missing-document-run",
      "index.json"
    );
    const before = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    fs.rmSync(
      path.join(storage, "runs", "missing-document-run", before.tests[0].file)
    );

    expect(() => persistence.finalizeRun("missing-document-run")).toThrow(
      /is missing/
    );

    const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    const mapping = JSON.parse(
      fs.readFileSync(path.join(storage, "mappings", "latest.json"), "utf8")
    ) as CobraMappingIndex;
    expect(index.status).toBe("failed");
    expect(mapping.baselineRunId).toBe("diagnostic-run");
  });

  it("marks an impact run failed when fewer tests are recorded than selected", () => {
    persistence.initRun("incomplete-impact", "impact", {
      expectedTestCount: 2,
    });
    const document: PerTestCoverage = {
      testId: "navigation.spec.ts > loads candidates",
      stableTestId: "impact-navigation-id",
      runId: "incomplete-impact",
      specFile: "automationTestcase/navigation.spec.ts",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 10,
      files: [],
      externalDeps: [],
    };
    persistence.writePerTest("incomplete-impact", document, "passed");

    expect(() => persistence.finalizeRun("incomplete-impact")).not.toThrow();
    const index = JSON.parse(
      fs.readFileSync(
        path.join(storage, "runs", "incomplete-impact", "index.json"),
        "utf8"
      )
    );
    expect(index.status).toBe("failed");
  });
});
