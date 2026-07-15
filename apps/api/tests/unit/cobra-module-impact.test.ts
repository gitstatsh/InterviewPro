import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CobraChangedFile } from "@interview/shared";
import {
  analyzeModuleImpact,
  modulePathMatches,
  parseCobraModuleMap,
  type CobraModuleMap,
} from "../../src/modules/cobra/cobra-module-impact";

const map: CobraModuleMap = {
  version: 1,
  tests: [
    { id: "login", specFile: "automationTestcase/login.spec.ts", tag: "@cobra:login" },
    {
      id: "candidates",
      specFile: "automationTestcase/sidebar-navigation.spec.ts",
      tag: "@cobra:candidates",
    },
    {
      id: "interviews",
      specFile: "automationTestcase/sidebar-navigation.spec.ts",
      tag: "@cobra:interviews",
    },
  ],
  modules: [
    {
      name: "candidates-page",
      paths: ["apps/web/src/app/(dashboard)/candidates/**"],
      tests: ["candidates"],
    },
    {
      name: "candidate-data",
      paths: ["apps/web/src/hooks/use-candidates.ts"],
      tests: ["candidates", "interviews"],
    },
  ],
  fullRegressionPaths: ["apps/web/src/lib/**", "automationTestcase/**"],
  ignoredPaths: ["**/*.md"],
};

function change(
  path: string,
  overrides: Partial<CobraChangedFile> = {}
): CobraChangedFile {
  return { path, status: "modified", lines: [1], ...overrides };
}

describe("COBRA module impact mapping", () => {
  it("supports repository glob matching without treating parentheses as regex", () => {
    expect(
      modulePathMatches(
        "apps/web/src/app/(dashboard)/candidates/page.tsx",
        "apps/web/src/app/(dashboard)/candidates/**"
      )
    ).toBe(true);
    expect(modulePathMatches("README.md", "**/*.md")).toBe(true);
  });

  it("selects one page test for a page-only change", () => {
    const result = analyzeModuleImpact(map, [
      change("apps/web/src/app/(dashboard)/candidates/page.tsx"),
    ]);

    expect(result.decision).toMatchObject({
      mode: "impacted",
      reason: "mapped-change",
      recommendedTests: ["candidates"],
      skippedTests: ["interviews", "login"],
      unmappedFiles: [],
    });
    expect(result.selectedTests.map((test) => test.tag)).toEqual(["@cobra:candidates"]);
  });

  it("unions tests across matched modules", () => {
    const result = analyzeModuleImpact(map, [
      change("apps/web/src/app/(dashboard)/candidates/page.tsx"),
      change("apps/web/src/hooks/use-candidates.ts"),
    ]);

    expect(result.decision.recommendedTests).toEqual(["candidates", "interviews"]);
    expect(result.matchedModules).toEqual(["candidate-data", "candidates-page"]);
  });

  it.each([
    "apps/web/src/lib/api.ts",
    "automationTestcase/support/auth.ts",
    "apps/web/src/unknown/new-page.tsx",
  ])("runs full regression for shared or unknown path %s", (path) => {
    const result = analyzeModuleImpact(map, [change(path)]);

    expect(result.decision.mode).toBe("full-regression");
    expect(result.decision.recommendedTests).toEqual([
      "candidates",
      "interviews",
      "login",
    ]);
    expect(result.decision.unmappedFiles).toEqual([path]);
  });

  it("evaluates both sides of a rename and falls back when either side is unknown", () => {
    const result = analyzeModuleImpact(map, [
      change("apps/web/src/app/(dashboard)/candidates/page.tsx", {
        status: "renamed",
        oldPath: "apps/web/src/legacy/candidates.tsx",
      }),
    ]);

    expect(result.decision.mode).toBe("full-regression");
    expect(result.decision.unmappedFiles).toEqual(["apps/web/src/legacy/candidates.tsx"]);
  });

  it("does not run tests for documentation-only changes", () => {
    const result = analyzeModuleImpact(map, [change("README.md")]);

    expect(result.decision).toMatchObject({
      mode: "impacted",
      reason: "no-changes",
      recommendedTests: [],
    });
    expect(result.ignoredFiles).toEqual(["README.md"]);
  });

  it("selects no tests for identical commits", () => {
    const result = analyzeModuleImpact(map, []);
    expect(result.decision.recommendedTests).toEqual([]);
    expect(result.decision.skippedTests).toEqual(["candidates", "interviews", "login"]);
  });

  it("rejects unknown test references in configuration", () => {
    const invalid = structuredClone(map) as unknown as Record<string, unknown>;
    (invalid.modules as Array<Record<string, unknown>>)[0].tests = ["missing"];
    expect(() => parseCobraModuleMap(invalid)).toThrow(/unknown test/i);
  });

  it("parses a valid configuration into a detached validated value", () => {
    const parsed = parseCobraModuleMap(structuredClone(map));
    expect(parsed).toEqual(map);
    expect(parsed).not.toBe(map);
  });

  it("validates the committed repository module map", () => {
    const file = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../cobra.modules.json"
    );
    const parsed = parseCobraModuleMap(JSON.parse(fs.readFileSync(file, "utf8")));
    expect(parsed.tests).toHaveLength(10);
    expect(parsed.modules.length).toBeGreaterThan(0);
    const selection = analyzeModuleImpact(parsed, [
      change("apps/web/src/app/(dashboard)/candidates/page.tsx"),
    ]);
    expect(selection.decision.recommendedTests).toEqual(["candidates"]);
    expect(selection.selectedTests.map((test) => test.tag)).toEqual(["@cobra:candidates"]);
  });
});
