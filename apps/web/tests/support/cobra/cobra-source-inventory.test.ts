import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCobraSourceInventory,
  isCobraSourceInventorySnapshot,
  normalizeInventoryPath,
} from "./cobra-source-inventory";

describe("COBRA whole-source inventory", () => {
  const temporaryRoots: string[] = [];

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cobra-inventory-"));
    temporaryRoots.push(root);
    return root;
  }

  function writeFile(root: string, relative: string, content: string): string {
    const file = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }

  function writeMapping(root: string, value: unknown): string {
    const file = path.join(root, ".cobra", "mappings", "latest.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
    return file;
  }

  it("includes untouched files, unions per-test lines, and ignores hosted chunks", () => {
    const root = createRoot();
    writeFile(
      root,
      "apps/web/src/feature.ts",
      "// comment\nexport const covered = 1;\n\nexport const alsoCovered = 2;\n"
    );
    writeFile(root, "apps/api/src/service.ts", "export const apiIsUncovered = true;\n");
    const mappingFile = writeMapping(root, {
      baselineRunId: "baseline-1",
      tests: [
        {
          testId: "navigation",
          files: [
            { path: "apps/web/src/feature.ts", linesTouched: [2, 2] },
            {
              path: "https://example.test/_next/static/chunks/app.js",
              linesTouched: [1],
            },
          ],
        },
        {
          testId: "search",
          files: [{ path: "apps/web/src/feature.ts", linesTouched: [2, 4, 999] }],
        },
      ],
    });

    const inventory = buildCobraSourceInventory({ repoRoot: root, mappingFile });
    const feature = inventory.files.find((file) => file.path.endsWith("feature.ts"));
    const service = inventory.files.find((file) => file.path.endsWith("service.ts"));

    expect(inventory.summary).toMatchObject({
      totalFiles: 2,
      measuredFiles: 2,
      notApplicableFiles: 0,
      coveredFiles: 1,
      uncoveredFiles: 1,
      totalLines: 3,
      touchedLines: 2,
      uncoveredLines: 1,
      coveragePercent: 66.67,
      mappedTests: 2,
    });
    expect(inventory.mapping).toMatchObject({
      ready: true,
      status: "ready",
      mappedFileCount: 1,
      ignoredNonRepoFileCount: 1,
    });
    expect(feature).toMatchObject({
      touchedLines: [2, 4],
      touchedLineCount: 2,
      uncoveredRanges: [],
      coveragePercent: 100,
      mappedTests: ["navigation", "search"],
    });
    expect(service).toMatchObject({
      touchedLines: [],
      coveragePercent: 0,
      uncoveredRanges: [[1, 1]],
    });
  });

  it("accepts in-repository file URLs and rejects remote or outside paths", () => {
    const root = createRoot();
    const sharedFile = writeFile(
      root,
      "packages/shared/src/value.ts",
      "// header\nexport const value = 1;\n"
    );
    const fileUrl = pathToFileURL(sharedFile).href;
    const mappingFile = writeMapping(root, {
      tests: [
        {
          testId: "shared value",
          files: [{ path: fileUrl, linesTouched: [2] }],
        },
      ],
    });

    const inventory = buildCobraSourceInventory({ repoRoot: root, mappingFile });

    expect(normalizeInventoryPath(fileUrl, root)).toBe("packages/shared/src/value.ts");
    expect(normalizeInventoryPath("https://example.test/app.js", root)).toBeNull();
    expect(normalizeInventoryPath(path.join(os.tmpdir(), "outside.ts"), root)).toBeNull();
    expect(inventory.mapping).toMatchObject({ status: "ready", mappedFileCount: 1 });
    expect(inventory.files[0]).toMatchObject({
      path: "packages/shared/src/value.ts",
      touchedLines: [2],
      coveragePercent: 100,
    });
  });

  it("excludes tests and generated support while treating comment-only files as N/A", () => {
    const root = createRoot();
    writeFile(root, "apps/web/src/real.ts", "export const real = true;\n");
    writeFile(root, "apps/web/src/comments.ts", "// only a comment\n/* and another */\n");
    writeFile(root, "apps/api/src/testing/cobra-harness.ts", "export const harness = true;\n");
    writeFile(root, "apps/web/src/generated/client.ts", "export const generated = true;\n");
    writeFile(root, "apps/web/src/__tests__/fixture.ts", "export const fixture = true;\n");
    writeFile(root, "apps/web/src/feature.spec.ts", "export const spec = true;\n");

    const inventory = buildCobraSourceInventory({ repoRoot: root });
    const comments = inventory.files.find((file) => file.path.endsWith("comments.ts"));

    expect(inventory.files.map((file) => file.path)).toEqual([
      "apps/web/src/comments.ts",
      "apps/web/src/real.ts",
    ]);
    expect(inventory.summary).toMatchObject({
      totalFiles: 2,
      measuredFiles: 1,
      notApplicableFiles: 1,
      coveredFiles: 0,
      uncoveredFiles: 1,
      totalLines: 1,
      uncoveredLines: 1,
      coveragePercent: 0,
    });
    expect(comments).toMatchObject({
      totalLines: 0,
      uncoveredLineCount: 0,
      uncoveredRanges: [],
      coveragePercent: null,
    });
    expect(inventory.mapping).toMatchObject({ ready: false, status: "missing" });
  });

  it("fails closed and reports invalid mapping JSON separately from missing mapping", () => {
    const root = createRoot();
    writeFile(root, "apps/web/src/feature.ts", "export const feature = true;\n");
    const mappingFile = writeMapping(root, "{not valid JSON");

    const invalid = buildCobraSourceInventory({ repoRoot: root, mappingFile });

    expect(invalid.mapping).toMatchObject({ ready: false, status: "invalid" });
    expect(invalid.mapping.error).toBeTruthy();
    expect(invalid.summary).toMatchObject({ touchedLines: 0, coveragePercent: 0 });

    fs.rmSync(mappingFile);
    const missing = buildCobraSourceInventory({ repoRoot: root, mappingFile });
    expect(missing.mapping).toMatchObject({ ready: false, status: "missing" });
    expect(missing.mapping.error).toBeUndefined();
  });

  it("validates the stable per-run source inventory snapshot schema", () => {
    const root = createRoot();
    writeFile(root, "apps/web/src/feature.ts", "export const feature = true;\n");
    const inventory = buildCobraSourceInventory({ repoRoot: root });
    const snapshot = {
      version: 1 as const,
      runId: "run-1",
      capturedAt: "2026-07-14T12:00:00.000Z",
      mappingArtifact: "mappings/latest.json",
      inventory,
    };

    expect(isCobraSourceInventorySnapshot(snapshot, "run-1")).toBe(true);
    expect(isCobraSourceInventorySnapshot(snapshot, "another-run")).toBe(false);
    expect(
      isCobraSourceInventorySnapshot({
        ...snapshot,
        inventory: { ...inventory, files: [{ path: "broken" }] },
      })
    ).toBe(false);
  });
});
