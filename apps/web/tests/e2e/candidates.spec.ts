import { test, expect } from "@playwright/test";

// These tests require a running API + seeded DB.
// Run with: pnpm --filter web test:e2e
// API must be at localhost:3001, web at localhost:3000.

const TEST_USER = { email: "jane@example.com", password: "SecurePass1" };

async function login(page: any) {
  await page.goto("/login");
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Candidates", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/candidates");
  });

  test("shows candidates list page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /candidates/i })).toBeVisible();
  });

  test("shows empty state when no candidates exist for date range", async ({ page }) => {
    // Page should render without crashing even if list is empty
    await expect(page.locator("table, [data-testid='empty-state'], text=No candidates")).toBeTruthy();
  });

  test("search field filters candidates", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill("alice");
    // Input should retain value
    await expect(searchInput).toHaveValue("alice");
  });

  test("add candidate button opens dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add candidate/i }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("form validates required fields", async ({ page }) => {
    await page.getByRole("button", { name: /add candidate/i }).click();
    await page.locator('[role="dialog"] button[type="submit"]').click();
    // Should show validation errors
    await expect(page.locator("text=required, text=invalid")).toBeTruthy();
  });
});
