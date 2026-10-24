import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, watchErrors } from "./helpers.ts";

test.describe("Track: a session that is not saved", () => {
  test("says so, asks before leaving, and stops asking once saved", async ({ page }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await page.evaluate(() => (window.location.hash = "#/today"));
    const goals = page.locator('a.pick-btn[href^="#/track/"]');
    await expect(goals.first()).toBeVisible();
    const total = await goals.count();
    expect(total).toBeGreaterThan(0);

    let recorded = false;
    for (let i = 0; i < total && !recorded; i++) {
      await page.evaluate(() => (window.location.hash = "#/today"));
      await expect(page.locator('a.pick-btn[href^="#/track/"]').nth(i)).toBeVisible();
      await page.locator('a.pick-btn[href^="#/track/"]').nth(i).click();
      const pad = page.getByRole("region", { name: "Record data" });
      await expect(pad).toBeVisible();
      for (const o of [
        pad.getByRole("button", { name: /Correct/ }),
        pad.getByRole("button", { name: "+ 1" }),
        pad.getByRole("button", { name: "Yes", exact: true }),
        pad.getByRole("radio").first(),
      ]) {
        if ((await o.count()) > 0) {
          await o.first().click();
          recorded = true;
          break;
        }
      }
    }
    expect(recorded, "no goal could be recorded without a timer").toBe(true);

    await expect(page.getByText("This session is not saved yet.")).toBeVisible();

    // Declining the question keeps the teacher on the screen with the session intact.
    page.once("dialog", (d) => void d.dismiss());
    await page.getByRole("link", { name: "← Change goal" }).click();
    await expect(page.getByRole("region", { name: "Record data" })).toBeVisible();
    await expect(page.getByText("This session is not saved yet.")).toBeVisible();

    // Saving removes the note, and then leaving does not ask.
    await page.getByRole("button", { name: /Save session/ }).click();
    const sure = page.getByRole("button", { name: "Yes, save it" });
    if ((await sure.count()) > 0) await sure.click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible();
    await expect(page.getByText("This session is not saved yet.")).toHaveCount(0);
    let asked = false;
    page.once("dialog", (d) => {
      asked = true;
      void d.dismiss();
    });
    await page.getByRole("link", { name: "← Change goal" }).click();
    await expect(page.getByRole("region", { name: "Record data" })).toHaveCount(0);
    expect(asked).toBe(false);
    expect(errors).toEqual([]);
  });
});
