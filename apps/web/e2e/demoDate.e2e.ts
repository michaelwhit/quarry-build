import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// Demo day: the phone's clock says Oct 30, the director taps Load sample students, and the lists
// should show reports that are due and not call every student behind on data.
test.describe("demo day lists on Oct 30", () => {
  test("after the sample load, What's due has reports due and does not call every student behind on data", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.clock.setFixedTime(new Date("2026-10-30T15:00:00Z"));
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "More" }).click();
    await page.getByRole("button", { name: "Load sample students" }).click();
    await expect(page.getByText(/12 students/)).toBeVisible();

    await page.goto("/#/due");
    await expect(page.getByLabel("Practice date")).toHaveValue("2026-10-30");
    const summary = page.locator(".numbers .name");
    await expect(summary).toHaveText(/^\d+ overdue · \d+ coming up · \d+ with data to record$/);
    const [overdue, comingUp, needs] = (await summary.innerText()).match(/\d+/g)!.map(Number);
    expect(overdue! + comingUp!).toBeGreaterThan(0);
    // The sample load moves the sessions up to today, so not all 12 students are behind on data.
    expect(needs).toBeLessThan(12);
    await expect(page.getByRole("region").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
