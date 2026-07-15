/**
 * COBRA — global setup that mints a runId and stamps it into the environment
 * so all workers (there's only one under TEST_MODE) and the fixture see it.
 * Also creates the run directory + empty index up-front so afterEach hooks
 * never race on directory creation.
 */

import { initRun } from "./support/cobra/cobra-persist";

export default async function globalSetup() {
  const hostedBrowser = process.env.HOSTED_COVERAGE === "1";
  if (process.env.COBRA_ENABLED !== "1" && !hostedBrowser) return;
  const runId =
    process.env.COBRA_RUN_ID ??
    new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
  process.env.COBRA_RUN_ID = runId;
  const kind =
    process.env.COBRA_RUN_KIND === "baseline"
      ? "baseline"
      : process.env.COBRA_RUN_KIND === "impact"
        ? "impact"
        : "adhoc";
  const expectedTestCount = Number(process.env.COBRA_EXPECTED_TEST_COUNT);
  initRun(runId, kind, {
    coverageMode: hostedBrowser ? "hosted-browser" : "full-stack",
    targetUrl: process.env.E2E_BASE_URL,
    commitSha: process.env.COBRA_COMMIT_SHA,
    deploymentVerified: process.env.COBRA_DEPLOYMENT_VERIFIED === "1",
    expectedTestCount:
      Number.isInteger(expectedTestCount) && expectedTestCount > 0
        ? expectedTestCount
        : undefined,
  });
  // eslint-disable-next-line no-console
  console.log(`[cobra] run started: ${runId}`);
}
