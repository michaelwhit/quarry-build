import { expect, test, type Page } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// The evaluation timeline on the meeting notices screen: no-school days and weekends are skipped,
// a month end rolls over, a bad entry says what is wrong, Copy waits for the tick, and nothing is
// kept when the person leaves the screen.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function openTimeline(page: Page) {
  await signIn(page, "director");
  await page.evaluate(() => {
    window.location.hash = "#/meeting-notices";
  });
  await expect(page.getByRole("heading", { name: "Meeting notices" })).toBeVisible();
  await page.getByRole("button", { name: "Evaluation timeline" }).click();
}

const timeline = (page: Page) => page.getByRole("region", { name: "Timeline" });

async function fill(page: Page, consent: string, days: string, off = "") {
  await page.getByLabel("Date consent was received").fill(consent);
  await page.getByLabel("School days allowed").fill(days);
  await page.getByLabel("No-school days").fill(off);
}

test.describe("evaluation timeline", () => {
  test("a no-school stretch and the weekend are skipped over Thanksgiving", async ({ page }) => {
    const errors = watchErrors(page);
    await openTimeline(page);
    // Wed Nov 25, 2026; Thu and Fri off; then Mon, Tue, Wed count as days 1 to 3.
    await fill(page, "2026-11-25", "3", "2026-11-26\n2026-11-27");
    await expect(timeline(page)).toContainText("Consent received: Nov 25, 2026");
    await expect(timeline(page)).toContainText("Evaluation due (3 school days): Dec 2, 2026");
    // Without the no-school days, Thu and Fri count and the third day is Mon Nov 30.
    await page.getByLabel("No-school days").fill("");
    await expect(timeline(page)).toContainText("Evaluation due (3 school days): Nov 30, 2026");
    expect(errors).toEqual([]);
  });

  test("the due date rolls into the next month and the meeting date follows it", async ({
    page,
  }) => {
    await openTimeline(page);
    // Fri Oct 30, 2026: Mon Nov 2, Tue Nov 3, Wed Nov 4.
    await fill(page, "2026-10-30", "3");
    await page.getByLabel("Days from the report to the meeting").fill("2");
    await expect(timeline(page)).toContainText("Evaluation due (3 school days): Nov 4, 2026");
    await expect(timeline(page)).toContainText(
      "Meeting by (2 school days after the due date): Nov 6, 2026",
    );
  });

  test("a bad entry says what is wrong and offers no copy", async ({ page }) => {
    await openTimeline(page);
    await expect(timeline(page).getByRole("note").first()).toContainText(
      "Date consent was received is not a real date.",
    );
    await fill(page, "2026-10-30", "0", "2026-13-40");
    await expect(timeline(page).getByRole("note")).toHaveText([
      "School days allowed must be a whole number from 1 to 200.",
      "A no-school day is not a real date.",
    ]);
    await expect(timeline(page).getByRole("checkbox")).toHaveCount(0);
    await expect(timeline(page).getByRole("button", { name: "Copy the timeline" })).toHaveCount(0);
  });

  test("Copy waits for the tick, copies the text on the page, and an edit takes the tick away", async ({
    page,
  }) => {
    await openTimeline(page);
    await fill(page, "2026-10-30", "3");
    const copy = timeline(page).getByRole("button", { name: "Copy the timeline" });
    await expect(copy).toBeDisabled();
    await timeline(page).getByLabel("I read this and it is right").check();
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect(timeline(page).getByRole("status")).toHaveText("Copied the timeline");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Consent received: Oct 30, 2026\nEvaluation due (3 school days): Nov 4, 2026",
    );
    await page.getByLabel("School days allowed").fill("4");
    await expect(timeline(page).getByLabel("I read this and it is right")).not.toBeChecked();
    await expect(copy).toBeDisabled();
  });

  test("nothing is kept when the person leaves the screen", async ({ page }) => {
    await openTimeline(page);
    await fill(page, "2026-10-30", "3");
    await expect(timeline(page)).toContainText("Nov 4, 2026");
    await tabBar(page).getByRole("link", { name: "Home" }).click();
    // Wait until the notices screen is really gone, or the two hash changes can merge into one.
    await expect(page.getByRole("heading", { name: "Meeting notices" })).toHaveCount(0);
    await page.evaluate(() => {
      window.location.hash = "#/meeting-notices";
    });
    await page.getByRole("button", { name: "Evaluation timeline" }).click();
    await expect(page.getByLabel("Date consent was received")).toHaveValue("");
    await expect(page.getByLabel("School days allowed")).toHaveValue("");
    const stored = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) =>
        (window.localStorage.getItem(k) ?? "").includes("2026-10-30"),
      ),
    );
    expect(stored).toEqual([]);
  });
});
