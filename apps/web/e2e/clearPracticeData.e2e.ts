import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// Every key the practice app keeps text under (src/data/practiceStorage.ts). A unit test fails
// when a key is added there without being added here.
const KEYS = [
  "goalline-practice-v1",
  "goalline-practice-services-v1",
  "goalline-practice-servicelog-v1",
  "goalline-practice-pwn-v1",
  "goalline-practice-plaafp-v1",
  "goalline-practice-srs-v1",
  "goalline-practice-reports-v1",
  "goalline-practice-goalextras-v1",
  "goalline-practice-placement-v1",
  "goalline-practice-transition-v1",
  "goalline-practice-considerations-v1",
  "goalline-practice-iepshort-v1",
  "goalline-practice-library-favorites-v1",
  "goalline-practice-my-items-v1",
];

test.describe("Clear practice data removes every kept key", () => {
  for (const key of KEYS) {
    test(`${key}: enables the button with no students, and is empty after the reload`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await signIn(page, "director");
      await tabBar(page).getByRole("link", { name: "More" }).click();
      const clear = page.getByRole("button", { name: "Clear practice data" });
      await expect(clear).toBeDisabled();
      await page.evaluate((k) => window.localStorage.setItem(k, "{}"), key);
      // Leave and come back so the screen looks again.
      await tabBar(page).getByRole("link", { name: "Home" }).click();
      await tabBar(page).getByRole("link", { name: "More" }).click();
      await expect(clear).toBeEnabled();
      await clear.click();
      await page.getByRole("button", { name: "Yes, clear practice data" }).click();
      await page.waitForLoadState("load");
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      const left = await page.evaluate(
        (ks) => ks.filter((k) => window.localStorage.getItem(k) !== null),
        KEYS,
      );
      expect(left).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("the practice build says signing out keeps the data", async ({ page }) => {
    await signIn(page, "case_manager");
    await tabBar(page).getByRole("link", { name: "More" }).click();
    await expect(page.getByText(/Signing out keeps it\./)).toBeVisible();
  });
});
