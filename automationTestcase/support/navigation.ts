import type { Page } from "@playwright/test";
import { expect } from "../../apps/web/tests/support/cobra/cobra-fixture";

export const sidebarPageNames = [
  "Dashboard",
  "Candidates",
  "Questions",
  "Question Banks",
  "Interviews",
  "Reports",
  "Org Settings",
  "Members",
  "Profile",
] as const;

export type SidebarPageName = (typeof sidebarPageNames)[number];

type SidebarDestination = {
  route: RegExp;
  heading: string | RegExp;
};

const sidebarDestinations = {
  Dashboard: {
    route: /\/dashboard\/?(?:[?#].*)?$/,
    heading: /Welcome back/i,
  },
  Candidates: {
    route: /\/candidates\/?(?:[?#].*)?$/,
    heading: "Candidates",
  },
  Questions: {
    route: /\/questions\/?(?:[?#].*)?$/,
    heading: "Questions",
  },
  "Question Banks": {
    route: /\/questions\/banks\/?(?:[?#].*)?$/,
    heading: "Question Bank",
  },
  Interviews: {
    route: /\/sessions\/?(?:[?#].*)?$/,
    heading: "Interviews",
  },
  Reports: {
    route: /\/reports\/?(?:[?#].*)?$/,
    heading: "Reports",
  },
  "Org Settings": {
    route: /\/settings\/?(?:[?#].*)?$/,
    heading: "Organization Settings",
  },
  Members: {
    route: /\/settings\/members\/?(?:[?#].*)?$/,
    heading: "Members",
  },
  Profile: {
    route: /\/profile\/?(?:[?#].*)?$/,
    heading: "Profile Settings",
  },
} satisfies Record<SidebarPageName, SidebarDestination>;

/** Clicks one left-panel menu option and verifies that its page loaded. */
export async function navigateToSidebarPage(
  page: Page,
  pageName: SidebarPageName
): Promise<void> {
  const destination = sidebarDestinations[pageName];
  const menuLink = page
    .getByRole("navigation")
    .getByRole("link", { name: pageName, exact: true });

  await expect(menuLink).toBeVisible({ timeout: 20_000 });
  await menuLink.click();

  await expect(page).toHaveURL(destination.route, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", {
      name: destination.heading,
      exact: typeof destination.heading === "string",
    })
  ).toBeVisible({ timeout: 20_000 });
}
