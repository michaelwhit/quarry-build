import { expect, test } from "@playwright/test";
import { noHorizontalScroll, signIn, watchErrors } from "./helpers.ts";

// Demo script step 7: the late reports are grouped by building and case manager, and the words
// say what is waiting, not who is bad.
test.describe("progress reports to file", () => {
  test("on Oct 30 the waiting reports are grouped by case manager in calm words", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await page.goto("/#/overdue");
    await expect(
      page.getByRole("heading", { level: 2, name: "Progress reports to file" }),
    ).toBeVisible();
    await page.getByLabel("Practice date").fill("2026-10-30");

    await expect(page.getByText(/\d+ waiting past their due date/)).toBeVisible();
    const buildings = page.getByRole("heading", { level: 3 });
    expect(await buildings.count()).toBeGreaterThan(0);
    const first = page.locator("details.card").first();
    await first.locator("summary").click();
    await expect(first.getByText(/Ask the case manager: /)).toBeVisible();
    await expect(first.locator("li").first()).toContainText(/Grade .* · due [A-Z][a-z]{2} \d+/);

    const words = (await page.getByRole("main").innerText()).toLowerCase();
    for (const blame of ["late", "failed", "behind", "delinquent", "fault", "negligent"])
      expect(words, blame).not.toContain(blame);
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test("another role gets the not-available page", async ({ page }) => {
    await signIn(page, "case_manager");
    await page.goto("/#/overdue");
    await expect(page.getByText(/not available/i).first()).toBeVisible();
  });
});
