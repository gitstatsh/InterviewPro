/** Playwright fixture that records browser coverage for each test. */

import { test as base, expect } from "@playwright/test";
import path from "node:path";
import { cobraClient } from "./cobra-client.js";
import {
  startBrowserCoverage,
  stopBrowserCoverage,
  summarizeBrowserCoverage,
} from "./cobra-browser-coverage.js";
import {
  convertBrowserCoverageWithDiagnostics,
  convertServerCoverage,
  mergeFileCoverage,
} from "./cobra-convert.js";
import { writePerTest } from "./cobra-persist.js";
import type {
  ExternalDep,
  FileCoverage,
  PerTestCoverage,
} from "./cobra-shape.js";

const SERVER_COVERAGE_ENABLED = process.env.COBRA_ENABLED === "1";
const HOSTED_COVERAGE_ENABLED = process.env.HOSTED_COVERAGE === "1";
const COVERAGE_ENABLED = SERVER_COVERAGE_ENABLED || HOSTED_COVERAGE_ENABLED;
const RUN_ID = process.env.COBRA_RUN_ID ?? "unknown-run";
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

type CobraFixtures = {
  /** Auto-fixture; test bodies do not need to consume a value. */
  _cobra: void;
};

export const test = base.extend<CobraFixtures>({
  _cobra: [
    async ({ page }, use, testInfo) => {
      if (!COVERAGE_ENABLED) {
        await use();
        return;
      }

      const startedAt = new Date();
      const startedAtIso = startedAt.toISOString();
      let browserCoverageStarted = false;

      if (SERVER_COVERAGE_ENABLED) {
        try {
          await cobraClient.reset();
        } catch (err) {
          testInfo.annotations.push({
            type: "cobra:server-setup-failed",
            description: (err as Error).message,
          });
        }
      }

      try {
        await startBrowserCoverage(page);
        browserCoverageStarted = true;
      } catch (err) {
        testInfo.annotations.push({
          type: "cobra:browser-setup-failed",
          description: (err as Error).message,
        });
      }

      await use();

      try {
        const browserEntries = browserCoverageStarted
          ? await stopBrowserCoverage(page)
          : [];
        const browserChunks = summarizeBrowserCoverage(browserEntries);
        const browserCoverage = await convertBrowserCoverageWithDiagnostics(
          browserEntries
        );

        let serverFiles: FileCoverage[] = [];
        let externalDeps: ExternalDep[] = [];
        if (SERVER_COVERAGE_ENABLED) {
          try {
            const serverSnapshot = await cobraClient.snapshot();
            serverFiles = await convertServerCoverage(serverSnapshot.v8);
            externalDeps = serverSnapshot.db.map((entry) => ({
              kind: entry.kind,
              model: entry.model,
              operation: entry.operation,
            }));
          } catch (err) {
            testInfo.annotations.push({
              type: "cobra:server-capture-failed",
              description: (err as Error).message,
            });
          }
        }

        const doc: PerTestCoverage = {
          testId: testInfo.titlePath.join(" > "),
          stableTestId: testInfo.testId,
          titlePath: [...testInfo.titlePath],
          projectName: testInfo.project.name,
          runId: RUN_ID,
          specFile: pathFromRepo(testInfo.file),
          startedAt: startedAtIso,
          durationMs: Date.now() - startedAt.getTime(),
          files: mergeFileCoverage(serverFiles, browserCoverage.files),
          externalDeps: dedupeExternalDeps(externalDeps),
          browserChunks,
          browserSourceMaps: browserCoverage.sourceMaps,
        };

        const status = (testInfo.status ?? "passed") as
          | "passed"
          | "failed"
          | "timedOut"
          | "skipped"
          | "interrupted";

        const outputPath = writePerTest(RUN_ID, doc, status);
        testInfo.annotations.push({
          type: "cobra:coverage",
          description: outputPath,
        });
      } catch (err) {
        testInfo.annotations.push({
          type: "cobra:capture-failed",
          description: (err as Error).message,
        });
      }
    },
    { auto: true },
  ],
});

function dedupeExternalDeps(deps: ExternalDep[]): ExternalDep[] {
  const seen = new Set<string>();
  const output: ExternalDep[] = [];
  for (const dependency of deps) {
    const key = `${dependency.kind}:${dependency.model ?? ""}:${dependency.operation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(dependency);
  }
  return output;
}

function pathFromRepo(file: string): string {
  return path.relative(REPO_ROOT, file).replace(/\\/g, "/");
}

export { expect };
