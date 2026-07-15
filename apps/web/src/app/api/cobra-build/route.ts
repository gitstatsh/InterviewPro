import { NextResponse } from "next/server";

/**
 * Public, non-secret deployment identity used by COBRA to ensure an impact
 * decision is tested against the same revision that produced the Git diff.
 */
export async function GET() {
  const commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.COBRA_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.COBRA_BUILD_COMMIT_SHA ??
    null;

  return NextResponse.json(
    {
      commitSha,
      sourceMaps:
        process.env.COBRA_SOURCE_MAPS === "1" ||
        process.env.COBRA_BUILD_SOURCE_MAPS === "1",
    },
    {
      headers: {
        // Deployment identity is a safety gate. A stale response could make
        // COBRA attribute tests to the wrong revision during a rollout.
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      },
    }
  );
}
