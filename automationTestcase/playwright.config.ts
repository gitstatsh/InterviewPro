import webConfig from "../apps/web/playwright.config";

/** Dedicated runner for the repository-level hosted automation suite. */
export default {
  ...webConfig,
  testDir: __dirname,
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
};
