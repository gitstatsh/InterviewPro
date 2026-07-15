import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadExternalSourceMap } from "../../src/testing/cobra-coverage.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("COBRA API external source maps", () => {
  it("embeds an adjacent external map for a file script", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cobra-map-"));
    temporaryDirectories.push(directory);
    const scriptPath = path.join(directory, "example.js");
    const mapPath = `${scriptPath}.map`;
    const sourceMap = {
      version: 3,
      sources: ["../src/example.ts"],
      names: [],
      mappings: "AAAA",
    };
    await writeFile(mapPath, JSON.stringify(sourceMap), "utf8");

    const result = await loadExternalSourceMap(
      "const value = true;\n//# sourceMappingURL=example.js.map",
      pathToFileURL(scriptPath).toString()
    );

    expect(result).toEqual({
      sourceMap,
      sourceMapUrl: pathToFileURL(mapPath).toString(),
    });
  });

  it("never follows a network source-map URL", async () => {
    await expect(
      loadExternalSourceMap(
        "const value = true;\n//# sourceMappingURL=https://example.test/map.json",
        "file:///app/example.js"
      )
    ).resolves.toBeUndefined();
  });
});
