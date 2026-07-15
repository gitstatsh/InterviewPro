import { test as cobraTest } from "../../apps/web/tests/support/cobra/cobra-fixture";

export const TEST_EXECUTION_DELAY_MS = 5_000;

type DelayState = {
  previousTestFinishedAt: number | null;
};

type TestFixtures = {
  testExecutionDelay: void;
};

type WorkerFixtures = {
  delayState: DelayState;
};

/**
 * Shared automation test fixture. With one worker, delayState survives across
 * spec files and enforces a gap between tests without delaying the first test.
 */
export const test = cobraTest.extend<TestFixtures, WorkerFixtures>({
  delayState: [
    async ({}, use) => {
      await use({ previousTestFinishedAt: null });
    },
    { scope: "worker" },
  ],

  testExecutionDelay: [
    async ({ delayState }, use) => {
      if (delayState.previousTestFinishedAt !== null) {
        const elapsed = Date.now() - delayState.previousTestFinishedAt;
        const remaining = TEST_EXECUTION_DELAY_MS - elapsed;
        if (remaining > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, remaining));
        }
      }

      await use();
      delayState.previousTestFinishedAt = Date.now();
    },
    { auto: true },
  ],
});
