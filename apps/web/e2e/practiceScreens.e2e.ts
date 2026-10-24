import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

test.describe("meeting notices, service minutes and Prior Written Notice", () => {
  test("the director reaches all three from Home and the student page, with no console errors", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "director");

    await page.getByRole("link", { name: /Meeting notices/ }).click();
    await expect(page.getByRole("heading", { name: "Meeting notices", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Evaluation timeline" }).click();
    await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();

    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator("ul.cards .name").first().click();

    await expect(page.getByRole("region", { name: "Recent notes" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Team" })).toBeVisible();

    await page.getByRole("link", { name: "Service minutes" }).click();
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(/service/i);
    await page.goBack();

    await page.getByRole("link", { name: "Prior Written Notice" }).click();
    await expect(page.getByRole("heading", { name: "Prior Written Notice draft" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a paraprofessional sees none of the three", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "para");
    await page.goto("/#/meeting-notices");
    await expect(page.getByRole("heading", { name: "Meeting notices", level: 2 })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Meeting notices/ })).toHaveCount(0);
  });
});
