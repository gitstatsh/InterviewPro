import { test } from "./support/test";
import { credentialsAvailable, signIn } from "./support/auth";

test.describe("Hosted login", () => {
  test.skip(
    !credentialsAvailable,
    "Set E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD in apps/web/.env"
  );

  test("signs in and loads the dashboard", async ({ page }) => {
    await signIn(page);
  });
});
