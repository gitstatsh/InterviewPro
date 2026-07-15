import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function loadPlaywrightEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadPlaywrightEnv(path.join(__dirname, ".env"));

const baseURL =
  process.env.E2E_BASE_URL ?? "https://app.techinterview.co.in";
const channel =
  process.env.E2E_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined;
const headed = /^(1|true|yes)$/i.test(process.env.E2E_HEADED ?? "true");
const coverageEnabled =
  process.env.HOSTED_COVERAGE === "1" || process.env.COBRA_ENABLED === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: !coverageEnabled,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: coverageEnabled || process.env.CI ? 1 : undefined,
  globalSetup: coverageEnabled
    ? path.join(__dirname, "tests", "cobra-global-setup.ts")
    : undefined,
  globalTeardown: coverageEnabled
    ? path.join(__dirname, "tests", "cobra-global-teardown.ts")
    : undefined,
  reporter: "html",
  use: {
    baseURL,
    headless: !headed,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel },
    },
  ],
});
