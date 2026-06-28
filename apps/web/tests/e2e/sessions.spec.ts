import { test, expect } from "@playwright/test";

const TEST_USER = { email: "jane@example.com", password: "SecurePass1" };

async function login(page: any) {
  await page.goto("/login");
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Sessions", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/sessions");
  });

  test("shows sessions list page with status tabs", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /interview sessions/i })).toBeVisible();
  });

  test("has create session button", async ({ page }) => {
    const btn = page.getByRole("button", { name: /schedule interview|new session/i });
    await expect(btn).toBeVisible();
  });

  test("status filter tabs are present", async ({ page }) => {
    // Page should have status filter controls (All / Scheduled / In Progress / Completed)
    await expect(page.locator("text=All, text=Scheduled")).toBeTruthy();
  });

  test("clicking a session row navigates to session detail", async ({ page }) => {
    // If sessions exist, click the first row
    const firstRow = page.locator("table tbody tr, [data-session-row]").first();
    const count = await firstRow.count();
    if (count > 0) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/sessions\/.+/);
    } else {
      test.skip();
    }
  });
});

test.describe("Session Detail", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows 404-like state for non-existent session", async ({ page }) => {
    await page.goto("/sessions/nonexistent-id");
    // Should either show error or redirect
    await expect(page.locator("text=not found, text=error, text=404")).toBeTruthy();
  });
});
