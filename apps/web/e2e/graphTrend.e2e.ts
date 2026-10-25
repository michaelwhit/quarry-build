import { expect, test, type Page } from "@playwright/test";
import {
  loadSamplesAsDirector,
  recordSimpleSession,
  signIn,
  tabBar,
  watchErrors,
} from "./helpers.ts";

// A goal's graph on the student page: the trend line shows from the third session, the data table
// lists every date with its year, and the Progress report button is for the director and case
// managers only.
async function newGoal(page: Page): Promise<{ student: string; track: string }> {
  await page.evaluate(() => {
    window.location.hash = "#/add-student";
  });
  await page.getByLabel("First name").fill("Sample");
  await page.getByLabel("Last name").fill("Learner");
  await page.getByRole("button", { name: "Add student" }).click();
  await page.getByRole("link", { name: "Add a goal" }).click();
  await page.getByLabel("Whole goal").fill("Sample will read a short passage aloud.");
  await page.getByLabel("Baseline").fill("2 of 10");
  await page.getByRole("button", { name: "Add goal" }).click();
  // The track link only exists once the student page has rendered, so read it first: it waits, and
  // the hash is then the student page's.
  const href = await page.locator('a[href*="#/track/"]').first().getAttribute("href");
  const student = await page.evaluate(() => window.location.hash);
  return { student, track: href! };
}

async function record(page: Page, track: string, student: string) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, track);
  expect(await recordSimpleSession(page)).toBe(true);
  await page.evaluate((h) => {
    window.location.hash = h;
  }, student);
}

const hint = (page: Page) => page.getByText("The trend line appears after 3 sessions.");

test.describe("graph and data table", () => {
  test("the trend line appears at the third session and the table shows dates with the year", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    const { student, track } = await newGoal(page);
    const year = String(new Date().getUTCFullYear());

    await expect(hint(page)).toHaveCount(0);
    await expect(page.locator("svg .trend")).toHaveCount(0);

    for (const n of [1, 2, 3]) {
      await record(page, track, student);
      await page.locator("details summary", { hasText: "Data table" }).first().click();
      await expect(page.locator("details table tbody tr")).toHaveCount(n);
      if (n < 3) {
        await expect(hint(page)).toBeVisible();
        await expect(page.locator("svg .trend")).toHaveCount(0);
      } else {
        await expect(hint(page)).toHaveCount(0);
        await expect(page.locator("svg .trend")).toHaveCount(1);
      }
    }
    for (const cell of await page.locator("details table tbody tr td:first-child").allInnerTexts())
      expect(cell).toMatch(new RegExp(`^[A-Z][a-z]{2} \\d{1,2}, ${year}$`));
    expect(errors).toEqual([]);
  });

  test("Progress report is offered to the director and case manager, not to a provider", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator("ul.cards .name").first().click();
    const student = await page.evaluate(() => window.location.hash);
    for (const role of ["director", "case_manager"] as const) {
      await signIn(page, role);
      await page.evaluate((h) => {
        window.location.hash = h;
      }, student);
      await expect(page.getByRole("link", { name: "Progress report" })).toHaveCount(1);
    }
    // A provider sees only the students they serve, and no report button on any of them.
    await signIn(page, "slp");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator("ul.cards .name").first().click();
    await expect(page.getByRole("link", { name: "Service minutes", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Progress report" })).toHaveCount(0);
  });
});
