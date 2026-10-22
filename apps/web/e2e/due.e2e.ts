import { expect, test } from "@playwright/test";
import { noHorizontalScroll, signIn, signOut, watchErrors } from "./helpers.ts";

test.describe("director's What's due screen", () => {
  test("shows what is overdue and who to ask, with no sideways scroll, and is director only", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await page.goto("/#/due");
    const heading = page.getByRole("heading", { level: 2, name: "What's due" });
    await expect(heading).toBeVisible();
    await expect(page).toHaveTitle("What's due · GoalLine");
    await page.getByLabel("Practice date").fill("2026-10-30");
    await expect(page.getByText(/^6 overdue · 6 coming up/)).toBeVisible();
    await expect(page.getByRole("region", { name: /Morgan|Riley/ }).first()).toBeVisible();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({
      path: process.env["DUE_SHOT"] ?? "test-results/due.png",
      fullPage: true,
    });
    await signOut(page);
    expect(errors).toEqual([]);
  });

  test("another role gets the not-available page", async ({ page }) => {
    await signIn(page, "case_manager");
    await page.goto("/#/due");
    await expect(page.getByText(/not available/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What's due" })).toHaveCount(0);
  });
});
