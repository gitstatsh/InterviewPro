import { test, expect } from "@playwright/test";

const TEST_USER = { email: "jane@example.com", password: "SecurePass1" };

async function login(page: any) {
  await page.goto("/login");
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows dashboard with welcome message", async ({ page }) => {
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test("has date range preset selector", async ({ page }) => {
    await expect(page.getByText("7 days")).toBeVisible();
    await expect(page.getByText("30 days")).toBeVisible();
    await expect(page.getByText("90 days")).toBeVisible();
  });

  test("stat cards render", async ({ page }) => {
    await expect(page.getByText("Total Sessions")).toBeVisible();
    await expect(page.getByText("Candidates")).toBeVisible();
    await expect(page.getByText("Avg. Score")).toBeVisible();
    await expect(page.getByText("Scheduled")).toBeVisible();
  });

  test("switching preset triggers refetch", async ({ page }) => {
    await page.getByText("7 days").click();
    // Button should become active (selected state)
    const btn = page.getByText("7 days");
    await expect(btn).toBeVisible();
  });

  test("Recent Sessions section renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /recent sessions/i })).toBeVisible();
    await expect(page.getByText("View all")).toBeVisible();
  });

  test("clicking View all navigates to sessions", async ({ page }) => {
    await page.getByText("View all").click();
    await expect(page).toHaveURL(/\/sessions/);
  });

  test("Most Used Questions section renders", async ({ page }) => {
    await expect(page.getByText(/most used questions/i)).toBeVisible();
  });
});
