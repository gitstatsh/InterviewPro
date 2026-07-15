import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  convertBrowserCoverage,
  convertBrowserCoverageWithDiagnostics,
  convertServerCoverage,
} from "./cobra-convert";

const temporaryDirectories: string[] = [];
const originalLocalMapDirectory = process.env.COBRA_LOCAL_SOURCE_MAP_DIR;
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

function createLocalMapDirectory(repoRelative = false): string {
  const parent = repoRelative
    ? path.join(REPO_ROOT, ".cobra", "test-local-maps")
    : os.tmpdir();
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "cobra-local-maps-"));
  temporaryDirectories.push(directory);
  process.env.COBRA_LOCAL_SOURCE_MAP_DIR = repoRelative
    ? path.relative(REPO_ROOT, directory)
    : directory;
  return directory;
}

function writeLocalPair(
  root: string,
  relativeScript: string,
  generated: string,
  sourcePath: string
): void {
  const script = path.join(root, ...relativeScript.split("/"));
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(
    script,
    `${generated}\n//# sourceMappingURL=${path.basename(script)}.map`,
    "utf8"
  );
  fs.writeFileSync(
    `${script}.map`,
    JSON.stringify({
      version: 3,
      sources: [sourcePath],
      names: [],
      mappings: "AAAA",
    }),
    "utf8"
  );
}

function coveredFunctions(source: string) {
  return [
    {
      functionName: "covered",
      ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
      isBlockCoverage: true,
    },
  ];
}

describe("COBRA browser source-map conversion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    if (originalLocalMapDirectory === undefined) {
      delete process.env.COBRA_LOCAL_SOURCE_MAP_DIR;
    } else {
      process.env.COBRA_LOCAL_SOURCE_MAP_DIR = originalLocalMapDirectory;
    }
  });

  it("does not fetch a cross-origin source map or publish a hosted chunk as source", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const source =
      "function covered() { return true; }\n" +
      "//# sourceMappingURL=https://untrusted.example/chunk.js.map";

    const files = await convertBrowserCoverage([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source,
        functions: [
          {
            functionName: "covered",
            ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
            isBlockCoverage: true,
          },
        ],
      },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(files).toEqual([]);
  });

  it("rejects a source-map response redirected outside the application origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      url: "https://untrusted.example/chunk.js.map",
      json: async () => ({
        version: 3,
        sources: ["file:///app/apps/web/src/redirected.ts"],
        names: [],
        mappings: "AAAA",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const generated = "function covered() { return true; }";
    const source = `${generated}\n//# sourceMappingURL=chunk.js.map`;

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source,
        functions: coveredFunctions(source),
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://app.example/_next/static/chunks/chunk.js.map"),
      expect.objectContaining({ redirect: "error" })
    );
    expect(converted.files).toEqual([]);
    expect(converted.sourceMaps.unresolvedMaps).toBe(1);
  });

  it("uses a recursive local map only for exact generated JavaScript", async () => {
    const directory = createLocalMapDirectory();
    const generated = "function covered() { return true; }";
    writeLocalPair(
      directory,
      "nested/chunk-local.js",
      generated,
      "file:///app/apps/web/src/lib/api.ts"
    );

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk-hosted.js",
        source: generated,
        functions: coveredFunctions(generated),
      },
    ]);

    expect(converted.files).toEqual([
      {
        path: "apps/web/src/lib/api.ts",
        functionsTouched: ["covered"],
        linesTouched: [1],
      },
    ]);
    expect(converted.sourceMaps).toEqual({
      totalScripts: 1,
      resolvedHostedMaps: 0,
      resolvedLocalExactMaps: 1,
      unresolvedMaps: 0,
    });

    fs.rmSync(path.join(directory, "nested", "chunk-local.js.map"));
    const cached = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk-hosted.js",
        source: generated,
        functions: coveredFunctions(generated),
      },
    ]);
    expect(cached.files.map((file) => file.path)).toEqual([
      "apps/web/src/lib/api.ts",
    ]);
  });

  it("resolves a configured relative map directory from the repository root", async () => {
    const directory = createLocalMapDirectory(true);
    const generated = "function covered() { return true; }";
    writeLocalPair(
      directory,
      "chunk.js",
      generated,
      "file:///app/apps/web/src/lib/auth-client.ts"
    );

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source: generated,
        functions: coveredFunctions(generated),
      },
    ]);

    expect(converted.files.map((file) => file.path)).toEqual([
      "apps/web/src/lib/auth-client.ts",
    ]);
    expect(converted.sourceMaps.resolvedLocalExactMaps).toBe(1);
  });

  it("rejects a local map when generated JavaScript differs by one byte", async () => {
    const directory = createLocalMapDirectory();
    const generated = "function covered() { return true; }";
    writeLocalPair(
      directory,
      "chunk.js",
      `${generated} `,
      "file:///app/apps/web/src/mismatch.ts"
    );

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source: generated,
        functions: coveredFunctions(generated),
      },
    ]);

    expect(converted.files).toEqual([]);
    expect(converted.sourceMaps.unresolvedMaps).toBe(1);
    expect(converted.sourceMaps.resolvedLocalExactMaps).toBe(0);
  });

  it("ignores local JavaScript without a directive and stale adjacent maps", async () => {
    const directory = createLocalMapDirectory();
    const noDirective = "function first() { return true; }";
    const staleDirective = "function second() { return true; }";
    const map = JSON.stringify({
      version: 3,
      sources: ["file:///app/apps/web/src/stale.ts"],
      names: [],
      mappings: "AAAA",
    });

    fs.writeFileSync(path.join(directory, "no-directive.js"), noDirective);
    fs.writeFileSync(path.join(directory, "no-directive.js.map"), map);
    fs.writeFileSync(
      path.join(directory, "stale.js"),
      `${staleDirective}\n//# sourceMappingURL=missing.map`
    );
    fs.writeFileSync(path.join(directory, "stale.js.map"), map);

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/no-directive.js",
        source: noDirective,
        functions: coveredFunctions(noDirective),
      },
      {
        url: "https://app.example/_next/static/chunks/stale.js",
        source: staleDirective,
        functions: coveredFunctions(staleDirective),
      },
    ]);

    expect(converted.files).toEqual([]);
    expect(converted.sourceMaps).toMatchObject({
      totalScripts: 2,
      resolvedLocalExactMaps: 0,
      unresolvedMaps: 2,
    });
  });

  it("rejects a local source-map reference that escapes the configured directory", async () => {
    const container = fs.mkdtempSync(
      path.join(os.tmpdir(), "cobra-local-map-escape-")
    );
    temporaryDirectories.push(container);
    const directory = path.join(container, "maps");
    fs.mkdirSync(directory);
    process.env.COBRA_LOCAL_SOURCE_MAP_DIR = directory;
    const generated = "function covered() { return true; }";
    fs.writeFileSync(
      path.join(directory, "chunk.js"),
      `${generated}\n//# sourceMappingURL=../outside.js.map`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(container, "outside.js.map"),
      JSON.stringify({
        version: 3,
        sources: ["file:///app/apps/web/src/escaped.ts"],
        names: [],
        mappings: "AAAA",
      }),
      "utf8"
    );

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source: generated,
        functions: coveredFunctions(generated),
      },
    ]);

    expect(converted.files).toEqual([]);
    expect(converted.sourceMaps.resolvedLocalExactMaps).toBe(0);
    expect(converted.sourceMaps.unresolvedMaps).toBe(1);
  });

  it("fails closed when identical scripts have different local maps", async () => {
    const directory = createLocalMapDirectory();
    const generated = "function covered() { return true; }";
    writeLocalPair(
      directory,
      "one/chunk.js",
      generated,
      "file:///app/apps/web/src/one.ts"
    );
    writeLocalPair(
      directory,
      "two/chunk.js",
      generated,
      "file:///app/apps/web/src/two.ts"
    );

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source: generated,
        functions: coveredFunctions(generated),
      },
    ]);

    expect(converted.files).toEqual([]);
    expect(converted.sourceMaps).toMatchObject({
      resolvedLocalExactMaps: 0,
      unresolvedMaps: 1,
    });
  });

  it("prefers a hosted source map over an exact local fallback", async () => {
    const directory = createLocalMapDirectory();
    const generated = "function covered() { return true; }";
    writeLocalPair(
      directory,
      "chunk.js",
      generated,
      "file:///app/apps/web/src/local.ts"
    );
    const hostedMap = {
      version: 3,
      sources: ["file:///app/apps/web/src/app/layout.tsx"],
      names: [],
      mappings: "AAAA",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => hostedMap,
    });
    vi.stubGlobal("fetch", fetchMock);
    const hostedSource = `${generated}\n//# sourceMappingURL=chunk.js.map`;

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source: hostedSource,
        functions: coveredFunctions(hostedSource),
      },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(converted.files.map((file) => file.path)).toEqual([
      "apps/web/src/app/layout.tsx",
    ]);
    expect(converted.sourceMaps).toMatchObject({
      resolvedHostedMaps: 1,
      resolvedLocalExactMaps: 0,
      unresolvedMaps: 0,
    });
  });

  it("filters framework paths that resemble repository source but do not exist", async () => {
    const hostedMap = {
      version: 3,
      sources: ["file:///app/apps/web/src/client/fake-next-runtime.ts"],
      names: [],
      mappings: "AAAA",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => hostedMap })
    );
    const generated = "function covered() { return true; }";
    const source = `${generated}\n//# sourceMappingURL=chunk.js.map`;

    const converted = await convertBrowserCoverageWithDiagnostics([
      {
        url: "https://app.example/_next/static/chunks/chunk.js",
        source,
        functions: coveredFunctions(source),
      },
    ]);

    expect(converted.files).toEqual([]);
    expect(converted.sourceMaps.resolvedHostedMaps).toBe(1);
  });
});

describe("COBRA V8 range overlay", () => {
  const scriptUrl = pathToFileURL(
    path.join(REPO_ROOT, "apps", "web", "src", "coverage-overlay.ts")
  ).toString();

  it("does not let an executed script range cover a zero-count nested function", async () => {
    const source = "top();\nchild();\ntail();\n";
    const childStart = source.indexOf("child();");
    const childEnd = childStart + "child();\n".length;

    const files = await convertServerCoverage([
      {
        scriptId: "nested-function",
        url: scriptUrl,
        source,
        functions: [
          {
            functionName: "topLevel",
            ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
            isBlockCoverage: true,
          },
          {
            functionName: "child",
            ranges: [
              { startOffset: childStart, endOffset: childEnd, count: 0 },
            ],
            isBlockCoverage: true,
          },
        ],
      },
    ]);

    expect(files).toEqual([
      {
        path: "apps/web/src/coverage-overlay.ts",
        functionsTouched: ["topLevel"],
        linesTouched: [1, 3],
      },
    ]);
  });

  it("lets the most-specific zero-count branch override all positive parents", async () => {
    const source =
      "top();\nchildStart();\nmissedBranch();\nchildEnd();\ntail();\n";
    const childStart = source.indexOf("childStart();");
    const childEnd = source.indexOf("tail();");
    const branchStart = source.indexOf("missedBranch();");
    const branchEnd = branchStart + "missedBranch();\n".length;

    const files = await convertServerCoverage([
      {
        scriptId: "nested-branch",
        url: scriptUrl,
        source,
        functions: [
          {
            functionName: "topLevel",
            ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
            isBlockCoverage: true,
          },
          {
            functionName: "child",
            ranges: [
              { startOffset: childStart, endOffset: childEnd, count: 1 },
              { startOffset: branchStart, endOffset: branchEnd, count: 0 },
            ],
            isBlockCoverage: true,
          },
        ],
      },
    ]);

    expect(files).toEqual([
      {
        path: "apps/web/src/coverage-overlay.ts",
        functionsTouched: ["child", "topLevel"],
        linesTouched: [1, 2, 4, 5],
      },
    ]);
  });
});

describe("COBRA hosted server source-map conversion", () => {
  it("uses embedded maps and normalizes remote apps/packages paths", async () => {
    const generated = "function covered() { return true; }\n";
    const functions = [
      {
        functionName: "covered",
        ranges: [{ startOffset: 0, endOffset: generated.length, count: 1 }],
        isBlockCoverage: true,
      },
    ];

    const files = await convertServerCoverage([
      {
        scriptId: "app-script",
        url: "file:///app/apps/api/dist/example.js",
        source: `${generated}//# sourceMappingURL=example.js.map`,
        sourceMapUrl: "file:///app/apps/api/dist/example.js.map",
        sourceMap: {
          version: 3,
          sources: ["file:///app/apps/api/src/example.ts"],
          names: [],
          mappings: "AAAA",
        },
        functions,
      },
      {
        scriptId: "package-script",
        url: "file:///workspace/packages/shared/dist/example.js",
        source: `${generated}//# sourceMappingURL=example.js.map`,
        sourceMapUrl: "file:///workspace/packages/shared/dist/example.js.map",
        sourceMap: {
          version: 3,
          sources: ["/workspace/packages/shared/src/example.ts"],
          names: [],
          mappings: "AAAA",
        },
        functions,
      },
    ]);

    expect(files).toEqual([
      {
        path: "apps/api/src/example.ts",
        functionsTouched: ["covered"],
        linesTouched: [1],
      },
      {
        path: "packages/shared/src/example.ts",
        functionsTouched: ["covered"],
        linesTouched: [1],
      },
    ]);
  });
});
