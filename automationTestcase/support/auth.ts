import type { Page } from "@playwright/test";
import { expect } from "../../apps/web/tests/support/cobra/cobra-fixture";

declare const process: { env: { [key: string]: string | undefined } };

const email = process.env.E2E_LOGIN_EMAIL;
const password = process.env.E2E_LOGIN_PASSWORD;

export const credentialsAvailable = Boolean(email && password);

export async function signIn(page: Page): Promise<void> {
  if (!email || !password) {
    throw new Error("E2E login credentials are not configured");
  }

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .click();

  await expect(page).toHaveURL(/\/dashboard\/?(?:[?#].*)?$/, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: /Welcome back/i })
  ).toBeVisible();
}
