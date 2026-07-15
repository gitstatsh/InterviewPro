import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectGitChanges,
  parseNameStatus,
  parseUnifiedZeroDiff,
} from "../../src/modules/cobra/cobra-git";

describe("parseNameStatus", () => {
  it("parses modified, added, deleted, and renamed records", () => {
    expect(
      parseNameStatus(
        [
          "M\tapps/api/src/app.ts",
          "A\tapps/web/src/new page.tsx",
          "D\tapps/web/src/old.ts",
          "R094\tapps/web/src/before.ts\tapps/web/src/after.ts",
        ].join("\n")
      )
    ).toEqual([
      {
        path: "apps/api/src/app.ts",
        status: "modified",
        lines: [],
        oldLines: [],
      },
      {
        path: "apps/web/src/new page.tsx",
        status: "added",
        lines: [],
        oldLines: [],
      },
      {
        path: "apps/web/src/old.ts",
        status: "deleted",
        lines: [],
        oldLines: [],
      },
      {
        path: "apps/web/src/after.ts",
        oldPath: "apps/web/src/before.ts",
        status: "renamed",
        lines: [],
        oldLines: [],
      },
    ]);
  });

  it("parses NUL-delimited paths without treating tabs or newlines as records", () => {
    const result = parseNameStatus(
      "M\0folder/file\twith-tab.ts\0R100\0old\nname.ts\0new\nname.ts\0"
    );

    expect(result).toEqual([
      {
        path: "folder/file\twith-tab.ts",
        status: "modified",
        lines: [],
        oldLines: [],
      },
      {
        path: "new\nname.ts",
        oldPath: "old\nname.ts",
        status: "renamed",
        lines: [],
        oldLines: [],
      },
    ]);
  });

  it("rejects unsupported or malformed records instead of silently omitting them", () => {
    expect(() => parseNameStatus("C100\told.ts\tcopy.ts")).toThrow(
      "Unsupported Git name-status token"
    );
    expect(() => parseNameStatus("R100\tonly-old.ts")).toThrow(
      "Malformed Git name-status record"
    );
  });

  it("keeps Git type changes as unsafe modified files", () => {
    expect(parseNameStatus("T\tapps/api/src/config.ts")).toEqual([
      {
        path: "apps/api/src/config.ts",
        status: "modified",
        lines: [],
        oldLines: [],
        structuralChange: true,
      },
    ]);
  });
});

describe("parseUnifiedZeroDiff", () => {
  it("collects every old and new line from multiple zero-context hunks", () => {
    const result = parseUnifiedZeroDiff(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -2 +2,2 @@
-old
+new
+another
@@ -10,2 +11 @@
-first
-second
+replacement`);

    expect(result).toEqual([
      {
        path: "src/app.ts",
        status: "modified",
        lines: [2, 3, 11],
        oldLines: [2, 10, 11],
        structuralChange: true,
      },
    ]);
  });

  it("handles added and deleted file ranges", () => {
    const result = parseUnifiedZeroDiff(`diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+one
+two
diff --git a/src/removed.ts b/src/removed.ts
deleted file mode 100644
--- a/src/removed.ts
+++ /dev/null
@@ -4,3 +0,0 @@
-four
-five
-six`);

    expect(result).toEqual([
      {
        path: "src/new.ts",
        status: "added",
        lines: [1, 2],
        oldLines: [],
      },
      {
        path: "src/removed.ts",
        status: "deleted",
        lines: [],
        oldLines: [4, 5, 6],
      },
    ]);
  });

  it("keeps both paths and line ranges for a modified rename", () => {
    const result = parseUnifiedZeroDiff(`diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 80%
rename from src/old-name.ts
rename to src/new-name.ts
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -7 +7 @@
-before
+after`);

    expect(result).toEqual([
      {
        path: "src/new-name.ts",
        oldPath: "src/old-name.ts",
        status: "renamed",
        lines: [7],
        oldLines: [7],
      },
    ]);
  });
});

describe("collectGitChanges", () => {
  const repositories: string[] = [];

  afterEach(() => {
    for (const repository of repositories.splice(0)) {
      fs.rmSync(repository, { recursive: true, force: true });
    }
  });

  function git(repository: string, ...args: string[]): string {
    return execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  }

  function createRepository(): { repository: string; base: string } {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), "cobra-git-"));
    repositories.push(repository);
    git(repository, "init", "--quiet");
    git(repository, "config", "user.email", "cobra@example.test");
    git(repository, "config", "user.name", "COBRA Test");
    fs.mkdirSync(path.join(repository, "src"));
    fs.writeFileSync(path.join(repository, "src", "app.ts"), "one\ntwo\nthree\n");
    fs.writeFileSync(path.join(repository, "src", "move.ts"), "move me\n");
    git(repository, "add", ".");
    git(repository, "commit", "--quiet", "-m", "baseline");
    return { repository, base: git(repository, "rev-parse", "HEAD") };
  }

  it("collects a safe base/head diff through execFile", async () => {
    const { repository, base } = createRepository();
    fs.writeFileSync(path.join(repository, "src", "app.ts"), "one\nchanged\nthree\n");
    git(repository, "add", "src/app.ts");
    git(repository, "commit", "--quiet", "-m", "change app");
    const head = git(repository, "rev-parse", "HEAD");

    await expect(
      collectGitChanges({ mode: "base-head", cwd: repository, base, head })
    ).resolves.toEqual([
      {
        path: "src/app.ts",
        status: "modified",
        lines: [2],
        oldLines: [2],
        oldPath: undefined,
      },
    ]);
  });

  it("compares the exact base and head trees for a rollback", async () => {
    const { repository, base: original } = createRepository();
    fs.writeFileSync(path.join(repository, "src", "app.ts"), "one\nbase-only\nthree\n");
    git(repository, "add", "src/app.ts");
    git(repository, "commit", "--quiet", "-m", "future base");
    const futureBase = git(repository, "rev-parse", "HEAD");

    await expect(
      collectGitChanges({
        mode: "base-head",
        cwd: repository,
        base: futureBase,
        head: original,
      })
    ).resolves.toEqual([
      {
        path: "src/app.ts",
        status: "modified",
        lines: [2],
        oldLines: [2],
        oldPath: undefined,
      },
    ]);
  });

  it("collects tracked, renamed, and untracked working-tree changes", async () => {
    const { repository } = createRepository();
    fs.writeFileSync(path.join(repository, "src", "app.ts"), "one\nchanged\nthree\n");
    git(repository, "mv", "src/move.ts", "src/moved.ts");
    fs.writeFileSync(path.join(repository, "src", "untracked.ts"), "new\n");

    const changes = await collectGitChanges({
      mode: "working-tree",
      cwd: repository,
    });

    expect(changes).toEqual([
      {
        path: "src/app.ts",
        status: "modified",
        lines: [2],
        oldLines: [2],
        oldPath: undefined,
      },
      {
        path: "src/moved.ts",
        oldPath: "src/move.ts",
        status: "renamed",
        lines: [],
        oldLines: [],
      },
      {
        path: "src/untracked.ts",
        status: "added",
        lines: [],
        oldLines: [],
      },
    ]);
  });

  it("preserves Unicode paths emitted by Git", async () => {
    const { repository } = createRepository();
    const unicodePath = path.join(repository, "src", "café.ts");
    fs.writeFileSync(unicodePath, "before\n");
    git(repository, "add", "src/café.ts");
    git(repository, "commit", "--quiet", "-m", "add unicode path");
    const unicodeBase = git(repository, "rev-parse", "HEAD");
    fs.writeFileSync(unicodePath, "after\n");
    git(repository, "add", "src/café.ts");
    git(repository, "commit", "--quiet", "-m", "change unicode path");
    const head = git(repository, "rev-parse", "HEAD");

    await expect(
      collectGitChanges({
        mode: "base-head",
        cwd: repository,
        base: unicodeBase,
        head,
      })
    ).resolves.toEqual([
      {
        path: "src/café.ts",
        status: "modified",
        lines: [1],
        oldLines: [1],
        oldPath: undefined,
      },
    ]);
  });

  it("rejects revision syntax that could be interpreted as Git options or ranges", async () => {
    await expect(
      collectGitChanges({
        mode: "base-head",
        cwd: os.tmpdir(),
        base: "--output=/tmp/file",
        head: "HEAD",
      })
    ).rejects.toThrow("Invalid Git base revision");
    await expect(
      collectGitChanges({
        mode: "base-head",
        cwd: os.tmpdir(),
        base: "main..other",
        head: "HEAD",
      })
    ).rejects.toThrow("Invalid Git base revision");
  });
});
