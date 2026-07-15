import { finalizeRun } from "./support/cobra/cobra-persist";
import { generateCoverageDashboard } from "./support/cobra/cobra-dashboard";

export default async function globalTeardown() {
  if (
    process.env.COBRA_ENABLED !== "1" &&
    process.env.HOSTED_COVERAGE !== "1"
  ) {
    return;
  }
  const runId = process.env.COBRA_RUN_ID;
  if (!runId) return;
  finalizeRun(runId);
  const dashboard = generateCoverageDashboard(runId);
  // eslint-disable-next-line no-console
  console.log(`[cobra] coverage dashboard: ${dashboard}`);
}
