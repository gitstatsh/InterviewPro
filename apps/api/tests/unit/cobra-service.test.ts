import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CobraMappingIndex } from "@interview/shared";

const mockEnvironment = vi.hoisted(() => ({
  storage: "",
  COBRA_ENABLED: "1",
  TEST_MODE: "0",
}));

vi.mock("../../src/config/env.js", () => ({
  env: {
    get COBRA_STORAGE_DIR() {
      return mockEnvironment.storage;
    },
    get COBRA_ENABLED() {
      return mockEnvironment.COBRA_ENABLED;
    },
    get TEST_MODE() {
      return mockEnvironment.TEST_MODE;
    },
  },
}));

describe("COBRA advisory build planning", () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "cobra-api-service-"));
  let createBuild: typeof import("../../src/modules/cobra/cobra.service")["createBuild"];
  let getDashboard: typeof import("../../src/modules/cobra/cobra.service")["getDashboard"];

  const baseSha = "a".repeat(40);
  const headSha = "b".repeat(40);

  function mapping(capability: CobraMappingIndex["coverageCapability"]): CobraMappingIndex {
    return {
      version: 1,
      baselineRunId: "verified-baseline",
      baselineCommitSha: baseSha,
      deploymentVerified: true,
      coverageCapability: capability,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tests: [
        {
          testId: "candidate-page",
          sourceRunId: "verified-baseline",
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
            totalScripts: 1,
            resolvedHostedMaps: 1,
            resolvedLocalExactMaps: 0,
            unresolvedMaps: 0,
          },
        },
      ],
    };
  }

  function writeMapping(name: "latest" | "trusted", value: CobraMappingIndex): void {
    const directory = path.join(storage, "mappings");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(value));
  }

  beforeAll(async () => {
    mockEnvironment.storage = storage;
    vi.resetModules();
    ({ createBuild, getDashboard } = await import(
      "../../src/modules/cobra/cobra.service"
    ));
  });

  beforeEach(() => {
    fs.rmSync(path.join(storage, "mappings"), { recursive: true, force: true });
    fs.rmSync(path.join(storage, "builds"), { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(storage, { recursive: true, force: true });
  });

  it("uses a verified source-only trusted baseline for a narrow plan", () => {
    writeMapping("latest", mapping("source"));
    writeMapping("trusted", mapping("source"));

    const build = createBuild({
      baseSha,
      headSha,
      source: "manual",
      changedFiles: [
        {
          path: "apps/web/src/app/candidates/page.tsx",
          status: "modified",
          lines: [10],
          oldLines: [10],
        },
      ],
    });

    expect(build.baselineRunId).toBe("verified-baseline");
    expect(build.selection).toMatchObject({
      mode: "impacted",
      reason: "mapped-change",
      recommendedTests: ["candidate-page"],
    });
  });

  it("ignores latest-only and mixed evidence for selective planning", () => {
    writeMapping("latest", mapping("source"));
    writeMapping("trusted", mapping("mixed"));

    const build = createBuild({
      baseSha,
      headSha,
      source: "webhook",
      changedFiles: [
        {
          path: "apps/web/src/app/candidates/page.tsx",
          status: "modified",
          lines: [10],
        },
      ],
    });

    expect(build.baselineRunId).toBeUndefined();
    expect(build.selection).toMatchObject({
      mode: "full-regression",
      reason: "mapping-missing",
    });
  });

  it.each([
    {
      label: "missing diagnostics",
      mutate(value: CobraMappingIndex) {
        delete value.tests[0].browserSourceMaps;
      },
    },
    {
      label: "local source maps",
      mutate(value: CobraMappingIndex) {
        value.tests[0].browserSourceMaps = {
          totalScripts: 1,
          resolvedHostedMaps: 0,
          resolvedLocalExactMaps: 1,
          unresolvedMaps: 0,
        };
      },
    },
    {
      label: "unresolved source maps",
      mutate(value: CobraMappingIndex) {
        value.tests[0].browserSourceMaps = {
          totalScripts: 1,
          resolvedHostedMaps: 0,
          resolvedLocalExactMaps: 0,
          unresolvedMaps: 1,
        };
      },
    },
    {
      label: "no repository source lines",
      mutate(value: CobraMappingIndex) {
        value.tests[0].files[0].linesTouched = [];
      },
    },
  ])("ignores trusted evidence with $label", ({ mutate }) => {
    const invalid = mapping("source");
    mutate(invalid);
    writeMapping("latest", mapping("source"));
    writeMapping("trusted", invalid);

    const build = createBuild({
      baseSha,
      headSha,
      source: "manual",
      changedFiles: [
        {
          path: "apps/web/src/app/candidates/page.tsx",
          status: "modified",
          lines: [10],
        },
      ],
    });

    expect(build.baselineRunId).toBeUndefined();
    expect(build.selection.mode).toBe("full-regression");
  });

  it("does not report a legacy source mapping as dashboard-ready", () => {
    const legacy = mapping("source");
    delete legacy.tests[0].browserSourceMaps;
    writeMapping("latest", legacy);

    expect(getDashboard().mapping.ready).toBe(false);
  });
});
