import { expect, test } from "@playwright/test";
import {
  PEOPLE,
  type RoleKey,
  loadSamplesAsDirector,
  signIn,
  tabBar,
  watchErrors,
} from "./helpers.ts";

const ROLE_TABS: Record<RoleKey, string[]> = {
  director: ["Home", "Today", "Caseload", "Libraries", "More"],
  case_manager: ["Home", "Today", "Caseload", "Libraries", "More"],
  slp: ["Home", "Today", "Caseload", "Libraries", "More"],
  para: ["Today", "More"],
  gen_ed: ["My students", "More"],
};

async function expectDataTag(page: import("@playwright/test").Page) {
  await expect(page.locator(".watermark")).toHaveText("TEST DATA · fake students only");
  await expect(page.locator(".watermark-bg")).toHaveText("TEST DATA");
}

test.describe("the TEST DATA tag", () => {
  for (const role of Object.keys(ROLE_TABS) as RoleKey[]) {
    test(`${PEOPLE[role].label}: shown on every tab and on the screens opened from them`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await loadSamplesAsDirector(page);
      await signIn(page, role);
      await expectDataTag(page);
      for (const name of ROLE_TABS[role]) {
        await tabBar(page).getByRole("link", { name }).click();
        await expectDataTag(page);
      }
      expect(errors).toEqual([]);
    });
  }

  test("the director sees it on a student, a goal to record, and the forms", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator("ul.cards a.card").first().click();
    await expect(page.getByRole("link", { name: "Track this goal" }).first()).toBeVisible();
    await expectDataTag(page);
    await page.getByRole("link", { name: "Track this goal" }).first().click();
    await expect(page.getByRole("region", { name: "Record data" })).toBeVisible();
    await expectDataTag(page);
    await page.evaluate(() => (window.location.hash = "#/add-student"));
    await expectDataTag(page);
    await page.evaluate(() => (window.location.hash = "#/import-students"));
    await expectDataTag(page);
  });

  test("it is not on the landing page, the picker or the tour", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".watermark, .watermark-bg")).toHaveCount(0);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".watermark, .watermark-bg")).toHaveCount(0);
    await page.goto("/tour/");
    await expect(page.locator(".watermark, .watermark-bg")).toHaveCount(0);
    await expect(page.getByText(/TEST DATA/)).toHaveCount(0);
  });

  test("the practice-data notice appears after sign-in and goes away once understood", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Continue as the director" }).click();
    const dialog = page.getByRole("dialog", { name: "Practice data, no real students" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("never sent anywhere");
    await dialog.getByRole("button", { name: "I understand" }).click();
    await expect(dialog).toHaveCount(0);
  });
});
