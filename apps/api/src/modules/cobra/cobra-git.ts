import { execFile } from "node:child_process";
import path from "node:path";
import type { CobraChangedFile } from "@interview/shared";

export type GitChangedFile = CobraChangedFile & {
  oldPath?: string;
  oldLines?: number[];
};

export type CollectGitChangesOptions =
  | {
      mode: "base-head";
      base: string;
      head: string;
      cwd?: string;
    }
  | {
      mode: "working-tree";
      cwd?: string;
      /** Untracked files are whole-file additions and therefore force a safe fallback. */
      includeUntracked?: boolean;
    };

type ChangeStatus = GitChangedFile["status"];

const MAX_GIT_OUTPUT_BYTES = 20 * 1024 * 1024;

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function sortedPositiveUnique(values: number[]): number[] {
  return [...new Set(values.filter((line) => Number.isInteger(line) && line > 0))]
    .sort((left, right) => left - right);
}

function statusFromToken(token: string): ChangeStatus {
  switch (token.charAt(0)) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
    case "T":
      return "modified";
    case "R":
      return "renamed";
    default:
      throw new Error(`Unsupported Git name-status token: ${token || "<empty>"}`);
  }
}

function nameStatusRecord(
  token: string,
  paths: string[]
): GitChangedFile {
  const status = statusFromToken(token);
  const requiredPaths = status === "renamed" ? 2 : 1;
  if (paths.length < requiredPaths || paths.slice(0, requiredPaths).some((item) => !item)) {
    throw new Error(`Malformed Git name-status record for ${token}`);
  }

  if (status === "renamed") {
    return {
      path: normalizePath(paths[1]),
      oldPath: normalizePath(paths[0]),
      status,
      lines: [],
      oldLines: [],
    };
  }

  return {
    path: normalizePath(paths[0]),
    status,
    lines: [],
    oldLines: [],
    ...(token.charAt(0) === "T" ? { structuralChange: true } : {}),
  };
}

/**
 * Parses `git diff --name-status`, including the NUL-delimited form used by
 * collectGitChanges. The NUL form is important because repository paths may
 * legally contain tabs or newlines.
 */
export function parseNameStatus(output: string): GitChangedFile[] {
  if (!output) return [];

  if (!output.includes("\0")) {
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [token, ...paths] = line.split("\t");
        return nameStatusRecord(token, paths);
      });
  }

  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes: GitChangedFile[] = [];

  for (let index = 0; index < fields.length; ) {
    const first = fields[index++];
    const inline = first.split("\t");
    const token = inline.shift() ?? "";
    const status = statusFromToken(token);
    const pathCount = status === "renamed" ? 2 : 1;
    const paths = inline;
    while (paths.length < pathCount && index < fields.length) {
      paths.push(fields[index++]);
    }
    changes.push(nameStatusRecord(token, paths));
  }

  return changes;
}

function decodeQuotedGitPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    throw new Error(`Unsupported quoted Git path: ${value}`);
  }
}

function patchPath(value: string): string | null {
  const withoutTimestamp = value.split("\t", 1)[0];
  if (withoutTimestamp === "/dev/null") return null;
  let decoded = decodeQuotedGitPath(withoutTimestamp);
  if (decoded.startsWith("a/") || decoded.startsWith("b/")) {
    decoded = decoded.slice(2);
  }
  return normalizePath(decoded);
}

function lineRange(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset).filter(
    (line) => line > 0
  );
}

type PatchAccumulator = {
  status: ChangeStatus;
  oldFile: string | null;
  newFile: string | null;
  explicitOldPath?: string;
  lines: number[];
  oldLines: number[];
  structuralChange: boolean;
};

function finishPatch(change: PatchAccumulator): GitChangedFile | null {
  let status = change.status;
  if (change.oldFile === null && change.newFile) status = "added";
  if (change.newFile === null && change.oldFile) status = "deleted";
  if (
    status === "modified" &&
    change.oldFile &&
    change.newFile &&
    change.oldFile !== change.newFile
  ) {
    status = "renamed";
  }

  const file = status === "deleted" ? change.oldFile : change.newFile;
  if (!file) return null;

  const result: GitChangedFile = {
    path: file,
    status,
    lines: sortedPositiveUnique(change.lines),
    oldLines: sortedPositiveUnique(change.oldLines),
    ...(status === "modified" && change.structuralChange
      ? { structuralChange: true }
      : {}),
  };
  if (status === "renamed") {
    const oldPath = change.explicitOldPath ?? change.oldFile;
    if (oldPath) result.oldPath = oldPath;
  }
  return result;
}

/**
 * Parses file paths and old/new line ranges from `git diff --unified=0`.
 * Zero-context hunk ranges contain changed lines only, so no surrounding
 * context is accidentally treated as a mapped change.
 */
export function parseUnifiedZeroDiff(output: string): GitChangedFile[] {
  const changes: GitChangedFile[] = [];
  let current: PatchAccumulator | null = null;

  const flush = () => {
    if (!current) return;
    const finished = finishPatch(current);
    if (finished) changes.push(finished);
    current = null;
  };

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("diff --git ")) {
      flush();
      current = {
        status: "modified",
        oldFile: null,
        newFile: null,
        lines: [],
        oldLines: [],
        structuralChange: false,
      };
      continue;
    }
    if (!current) continue;

    if (line.startsWith("new file mode ")) {
      current.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      current.status = "deleted";
      continue;
    }
    if (line.startsWith("old mode ") || line.startsWith("new mode ")) {
      current.structuralChange = true;
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.explicitOldPath = normalizePath(
        decodeQuotedGitPath(line.slice("rename from ".length))
      );
      current.oldFile = current.explicitOldPath;
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.status = "renamed";
      current.newFile = normalizePath(
        decodeQuotedGitPath(line.slice("rename to ".length))
      );
      continue;
    }
    if (line.startsWith("--- ")) {
      current.oldFile = patchPath(line.slice(4));
      continue;
    }
    if (line.startsWith("+++ ")) {
      current.newFile = patchPath(line.slice(4));
      continue;
    }

    const hunk = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
    );
    if (!hunk) continue;
    const oldStart = Number(hunk[1]);
    const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const newStart = Number(hunk[3]);
    const newCount = hunk[4] === undefined ? 1 : Number(hunk[4]);
    if (oldCount !== newCount) current.structuralChange = true;
    current.oldLines.push(...lineRange(oldStart, oldCount));
    current.lines.push(...lineRange(newStart, newCount));
  }

  flush();
  return changes;
}

function assertSafeRevision(value: string, label: "base" | "head"): void {
  if (
    value.length === 0 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ||
    value.includes("..") ||
    value.includes("//")
  ) {
    throw new Error(`Invalid Git ${label} revision`);
  }
}

function executeGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: "utf8",
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const detail = stderr.trim();
        reject(
          new Error(detail ? `Git diff failed: ${detail}` : "Git diff failed", {
            cause: error,
          })
        );
      }
    );
  });
}

function mergeChanges(
  namedChanges: GitChangedFile[],
  patchChanges: GitChangedFile[]
): GitChangedFile[] {
  const patchesByPath = new Map(
    patchChanges.map((change) => [normalizePath(change.path), change])
  );

  return namedChanges.map((named) => {
    const patch = patchesByPath.get(normalizePath(named.path));
    return {
      ...named,
      lines: patch?.lines ?? [],
      oldLines: patch?.oldLines ?? [],
      oldPath: named.oldPath ?? patch?.oldPath,
      ...(named.structuralChange || patch?.structuralChange
        ? { structuralChange: true }
        : {}),
    };
  });
}

/** Collects a commit-range or working-tree diff without invoking a shell. */
export async function collectGitChanges(
  options: CollectGitChangesOptions
): Promise<GitChangedFile[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  let revisionArgs: string[];

  if (options.mode === "base-head") {
    assertSafeRevision(options.base, "base");
    assertSafeRevision(options.head, "head");
    // Compare the exact base tree that produced the promoted mapping with the
    // requested head. Triple-dot would silently compare from merge-base.
    revisionArgs = [options.base, options.head];
  } else {
    revisionArgs = ["HEAD"];
  }

  const common = ["--find-renames", "--diff-filter=AMDRT", ...revisionArgs, "--"];
  const [nameStatusOutput, patchOutput] = await Promise.all([
    executeGit(
      ["-c", "core.quotePath=false", "diff", "--name-status", "-z", ...common],
      cwd
    ),
    executeGit(
      [
        "-c",
        "core.quotePath=false",
        "diff",
        "--unified=0",
        "--no-color",
        "--no-ext-diff",
        ...common,
      ],
      cwd
    ),
  ]);
  const changes = mergeChanges(
    parseNameStatus(nameStatusOutput),
    parseUnifiedZeroDiff(patchOutput)
  );

  if (options.mode !== "working-tree" || options.includeUntracked === false) {
    return changes;
  }

  const untrackedOutput = await executeGit(
    ["ls-files", "--others", "--exclude-standard", "-z", "--"],
    cwd
  );
  const trackedPaths = new Set(changes.map((change) => change.path));
  for (const file of untrackedOutput.split("\0").filter(Boolean)) {
    const normalized = normalizePath(file);
    if (trackedPaths.has(normalized)) continue;
    changes.push({
      path: normalized,
      status: "added",
      lines: [],
      oldLines: [],
    });
  }
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}
