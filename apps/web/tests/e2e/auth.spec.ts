import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("shows login page for unauthenticated users", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page has email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("register page has name, email, and password fields", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator('input[autocomplete="name"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("shows validation errors for empty login submission", async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Invalid email address")).toBeVisible();
  });

  test("redirects authenticated users away from login", async ({ page }) => {
    // This test requires a valid session — skipped in unit mode
    test.skip();
  });
});
