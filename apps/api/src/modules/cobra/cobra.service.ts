import { randomUUID } from "node:crypto";
import type {
  CobraBuild,
  CobraChangedFile,
  CobraDashboard,
} from "@interview/shared";
import { isTrustedCobraMapping } from "@interview/shared";
import { env } from "../../config/env.js";
import { analyzeImpact } from "./cobra-impact.js";
import {
  listBuilds,
  readBuild,
  readMapping,
  readTrustedMapping,
  writeBuild,
} from "./cobra.storage.js";

type CreateBuildInput = {
  baseSha?: string;
  headSha?: string;
  commitSha?: string;
  branch?: string;
  source: "webhook" | "manual";
  changedFiles: CobraChangedFile[];
};

function shasMatch(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a.length < 7 || b.length < 7 || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) {
    return false;
  }
  return a.startsWith(b) || b.startsWith(a);
}

export function createBuild(input: CreateBuildInput): CobraBuild {
  let mapping: ReturnType<typeof readMapping> = null;
  try {
    const candidate = readTrustedMapping();
    if (
      isTrustedCobraMapping(candidate) &&
      shasMatch(candidate.baselineCommitSha, input.baseSha)
    ) {
      mapping = candidate;
    }
  } catch {
    // Corrupt or unreadable mapping evidence must never enable a narrow plan.
  }
  const build: CobraBuild = {
    id: `${Date.now()}-${randomUUID().slice(0, 8)}`,
    baselineRunId: mapping?.baselineRunId,
    baseSha: input.baseSha,
    headSha: input.headSha ?? input.commitSha,
    commitSha: input.headSha || input.commitSha || "unknown",
    branch: input.branch || "unknown",
    source: input.source,
    receivedAt: new Date().toISOString(),
    // API analysis endpoints are advisory only. Verified execution is owned by
    // scripts/cobra-runner.ts in a real Git checkout.
    status: "planned",
    selection: analyzeImpact(mapping, input.changedFiles),
    executedTests: [],
  };
  writeBuild(build);
  return build;
}

export function getBuild(id: string): CobraBuild | null {
  return readBuild(id);
}

export function getDashboard(): CobraDashboard {
  const mapping = readMapping();
  const allFiles = new Set(
    mapping?.tests.flatMap((test) => test.files.map((file) => file.path)) ?? []
  );
  const sourceFiles = new Set(
    [...allFiles].filter((file) =>
      /^(apps|packages)\/[^/]+\/src\//.test(file.replace(/\\/g, "/"))
    )
  );
  return {
    enabled: env.COBRA_ENABLED === "1" || env.TEST_MODE === "1",
    mapping: {
      ready: Boolean(
        isTrustedCobraMapping(mapping) &&
          sourceFiles.size > 0 &&
          mapping.tests.length > 0
      ),
      baselineRunId: mapping?.baselineRunId,
      baselineCommitSha: mapping?.baselineCommitSha,
      deploymentVerified: mapping?.deploymentVerified,
      coverageCapability: mapping?.coverageCapability,
      updatedAt: mapping?.updatedAt,
      testCount: mapping?.tests.length ?? 0,
      fileCount: sourceFiles.size,
      generatedFileCount: allFiles.size - sourceFiles.size,
    },
    builds: listBuilds(),
  };
}
