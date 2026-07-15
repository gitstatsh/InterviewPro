import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateCoverageDashboard } from "./cobra-dashboard";
import {
  isCobraSourceInventorySnapshot,
  type CobraSourceInventorySnapshot,
} from "./cobra-source-inventory";

describe("COBRA standalone dashboard snapshots", () => {
  const temporaryRoots: string[] = [];

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cobra-dashboard-"));
    temporaryRoots.push(root);
    return root;
  }

  function writeJson(root: string, relative: string, value: unknown): string {
    const file = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return file;
  }

  function mapping(testId: string, linesTouched: number[]) {
    return {
      version: 1,
      baselineRunId: "baseline-one",
      deploymentVerified: true,
      createdAt: "2026-07-14T09:00:00.000Z",
      updatedAt: "2026-07-14T09:00:00.000Z",
      tests: [
        {
          testId,
          files: [
            {
              path: "apps/web/src/feature.ts",
              linesTouched,
            },
          ],
        },
      ],
    };
  }

  function build(options: {
    id: string;
    runId?: string;
    commitSha: string;
    receivedAt: string;
    baselineRunId?: string;
  }) {
    return {
      id: options.id,
      runId: options.runId,
      baselineRunId: options.baselineRunId,
      commitSha: options.commitSha,
      branch: "feature/dashboard",
      source: "manual",
      receivedAt: options.receivedAt,
      finishedAt: options.receivedAt,
      durationMs: 10,
      status: "passed",
      selection: {
        mode: "impacted",
        reason: "mapped-change",
        changedFiles: [
          { path: "apps/web/src/feature.ts", status: "modified", lines: [1] },
        ],
        recommendedTests: ["login navigation"],
        skippedTests: [],
        unmappedFiles: [],
      },
      executedTests: [
        { testId: "login navigation", status: "passed", durationMs: 10 },
      ],
    };
  }

  it("pins source inventory and impact to the requested run", () => {
    const repoRoot = createRoot();
    const cobraRoot = path.join(repoRoot, ".cobra");
    const runId = "impact-run-one";
    const sourceFile = path.join(repoRoot, "apps", "web", "src", "feature.ts");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(
      sourceFile,
      "export const covered = 1;\nexport const uncovered = 2;\n"
    );
    writeJson(repoRoot, `.cobra/runs/${runId}/index.json`, {
      runId,
      kind: "impact",
      coverageMode: "source-mapped",
      createdAt: "2026-07-14T10:00:00.000Z",
      finishedAt: "2026-07-14T10:00:01.000Z",
      tests: [],
    });
    writeJson(repoRoot, ".cobra/mappings/baseline-one.json", mapping("baseline test", [1]));
    writeJson(repoRoot, ".cobra/mappings/latest.json", mapping("newer mapping", [1, 2]));
    writeJson(
      repoRoot,
      `.cobra/builds/${runId}.json`,
      build({
        id: runId,
        runId,
        baselineRunId: "baseline-one",
        commitSha: "associated1234567890",
        receivedAt: "2026-07-14T10:00:00.000Z",
      })
    );
    writeJson(
      repoRoot,
      ".cobra/builds/newest-unrelated.json",
      build({
        id: "newest-unrelated",
        runId: "another-run",
        commitSha: "unrelated9999999999",
        receivedAt: "2026-07-14T11:00:00.000Z",
      })
    );
    writeJson(repoRoot, ".cobra/builds/malformed.json", {
      id: "malformed-build-must-be-ignored",
      receivedAt: "2026-07-14T12:00:00.000Z",
      status: 42,
    });
    const brokenBuild = path.join(cobraRoot, "builds", "broken.json");
    fs.writeFileSync(brokenBuild, "{not-json");

    // A corrupt prior snapshot must not make dashboard generation fail.
    writeJson(repoRoot, `.cobra/runs/${runId}/source-inventory.json`, {
      version: 1,
      runId,
      inventory: { files: "not-an-array" },
    });

    const output = generateCoverageDashboard(runId, { cobraRoot, repoRoot });
    const runOutput = path.join(cobraRoot, "dashboard", `${runId}.html`);
    const snapshotFile = path.join(
      cobraRoot,
      "runs",
      runId,
      "source-inventory.json"
    );
    const snapshot = JSON.parse(
      fs.readFileSync(snapshotFile, "utf8")
    ) as CobraSourceInventorySnapshot;
    const html = fs.readFileSync(output, "utf8");
    const impactSection = html.slice(
      html.indexOf('<section class="panel" id="impact">'),
      html.indexOf('<div class="section-title" id="runtime">')
    );

    expect(output).toBe(path.join(cobraRoot, "dashboard", "index.html"));
    expect(fs.existsSync(runOutput)).toBe(true);
    expect(fs.readFileSync(runOutput, "utf8")).toBe(html);
    expect(isCobraSourceInventorySnapshot(snapshot, runId)).toBe(true);
    expect(snapshot.mappingArtifact).toBe("mappings/baseline-one.json");
    expect(snapshot.inventory.summary).toMatchObject({
      totalFiles: 1,
      totalLines: 2,
      touchedLines: 1,
      uncoveredLines: 1,
      coveragePercent: 50,
    });
    expect(snapshot.inventory.mapping.baselineRunId).toBe("baseline-one");
    expect(impactSection).toContain("associated1234567890");
    expect(impactSection).not.toContain("unrelated9999999999");
    expect(html).not.toContain("malformed-build-must-be-ignored");

    // Even the immutable mapping changing later cannot rewrite a historical
    // run's already-captured source view.
    writeJson(
      repoRoot,
      ".cobra/mappings/baseline-one.json",
      mapping("replacement test", [1, 2])
    );
    generateCoverageDashboard(runId, { cobraRoot, repoRoot });
    const regeneratedSnapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    expect(regeneratedSnapshot).toEqual(snapshot);
    expect(fs.readFileSync(runOutput, "utf8")).toContain("50.0%");
    expect(fs.readFileSync(runOutput, "utf8")).toContain("baseline test");
    expect(fs.readFileSync(runOutput, "utf8")).not.toContain("replacement test");
  });

  it("rejects a malformed run index with a stable error", () => {
    const repoRoot = createRoot();
    const cobraRoot = path.join(repoRoot, ".cobra");
    writeJson(repoRoot, ".cobra/runs/bad-run/index.json", {
      runId: "another-run",
      createdAt: "2026-07-14T10:00:00.000Z",
      tests: [],
    });

    expect(() =>
      generateCoverageDashboard("bad-run", { cobraRoot, repoRoot })
    ).toThrow("Invalid coverage index for run: bad-run");
  });
});
