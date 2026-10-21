import { expect, test } from "@playwright/test";
import {
  directorNames,
  expectNoLastNames,
  loadSamplesAsDirector,
  recordSimpleSession,
  signIn,
  tabBar,
  watchErrors,
} from "./helpers.ts";

test.describe("paraprofessional limits", () => {
  test("sees only the shared goals, first names only, with a Start a session button on each", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    const names = await directorNames(page);
    await signIn(page, "para");
    await expect(page.getByRole("heading", { name: "Your goals today", level: 2 })).toBeVisible();
    const cards = page.locator("ul.pick > li.card");
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(names.length);
    await expect(page.getByRole("link", { name: "Start a session" })).toHaveCount(n);
    await expectNoLastNames(page, names);
    expect(errors).toEqual([]);
  });

  test("has no way to add, edit, share, see history, or reach other students", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "para");
    for (const text of [
      "Add a student",
      "Import from file",
      "Edit student",
      "Edit goal",
      "Add a goal",
      "Caseload",
      "Libraries",
    ])
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    // Typing an address for a screen outside Today and More still shows Today.
    for (const hash of ["#/caseload", "#/add-student", "#/import-students", "#/libraries", "#/"]) {
      await page.evaluate((h) => (window.location.hash = h), hash);
      await expect(page.getByRole("heading", { name: "Your goals today", level: 2 })).toBeVisible();
      await expect(page.getByText("Import students")).toHaveCount(0);
    }
  });

  test("can record a session on a shared goal, with no history or edit controls on that screen", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "para");
    const starts = page.getByRole("link", { name: "Start a session" });
    const total = await starts.count();
    let saved = false;
    for (let i = 0; i < total && !saved; i++) {
      await page.getByRole("link", { name: "Start a session" }).nth(i).click();
      await expect(page.getByRole("region", { name: "Record data" })).toBeVisible();
      await expect(page.getByRole("region", { name: "History" })).toHaveCount(0);
      await expect(page.getByText("Edit goal")).toHaveCount(0);
      saved = await recordSimpleSession(page);
      if (saved)
        await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible();
      else await tabBar(page).getByRole("link", { name: "Today" }).click();
    }
    expect(saved, "no shared goal could be recorded without a timer").toBe(true);
    expect(errors).toEqual([]);
  });

  test("a goal that is not shared cannot be opened by address", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "para");
    await page.evaluate(() => (window.location.hash = "#/track/not-a-student/not-a-goal"));
    await expect(page.getByRole("region", { name: "Record data" })).toHaveCount(0);
  });
});
