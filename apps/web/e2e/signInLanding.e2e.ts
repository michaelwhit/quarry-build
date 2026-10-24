import { expect, test } from "@playwright/test";
import { header, loadSamplesAsDirector, signIn, signOut } from "./helpers.ts";

test.describe("where the next person lands", () => {
  test("signing out and in as someone else starts at that person's first screen, not the old page", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await page.evaluate(() => {
      window.location.hash = "#/more";
    });
    await expect(page.getByRole("heading", { name: "More", level: 2 })).toBeVisible();
    await signOut(page);

    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: /Practice Teacher/ }).click();
    await page.getByLabel("I have read this and I agree.").check();
    await page.getByRole("button", { name: "I agree, continue" }).click();
    await expect(header(page)).toContainText("Practice Teacher");
    await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
    expect(await page.evaluate(() => window.location.hash)).toBe("#/");
  });
});
