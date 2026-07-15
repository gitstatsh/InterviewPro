import { test } from "./support/test";
import { credentialsAvailable, signIn } from "./support/auth";
import {
  navigateToSidebarPage,
  sidebarPageNames,
} from "./support/navigation";

test.describe("Left sidebar navigation", () => {
  test.skip(
    !credentialsAvailable,
    "Set E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD in apps/web/.env"
  );

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const pageName of sidebarPageNames) {
    const tag = `@cobra:${pageName.toLowerCase().replaceAll(" ", "-")}`;
    test(
      `navigates to ${pageName}`,
      { tag },
      async ({ page }) => {
        await navigateToSidebarPage(page, pageName);
      }
    );
  }
});
