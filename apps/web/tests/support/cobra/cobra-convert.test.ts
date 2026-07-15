import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convertBrowserCoverage,
  convertServerCoverage,
} from "./cobra-convert";

describe("COBRA browser source-map conversion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
