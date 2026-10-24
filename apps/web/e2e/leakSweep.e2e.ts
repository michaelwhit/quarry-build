import { expect, test, type Page } from "@playwright/test";
import {
  directorNames,
  expectNoLastNames,
  loadSamplesAsDirector,
  signIn,
  tabBar,
  watchErrors,
} from "./helpers.ts";

const PRIVATE_WORDS = /\b(birth ?date|date of birth|born|DOB|Case ID)\b/i;
const MINUTES_WORDS = /\bservice minutes\b|\bminutes (per|a) week\b|\bmin\/wk\b/i;

/** What a screen must not show to this role; called after every step of the walk. */
async function expectNothingPrivate(
  page: Page,
  lastNames: { last: string }[] | null,
  minutesHidden = false,
) {
  const text = await page.locator("body").innerText();
  expect(text, "a birth date or case id is on the page").not.toMatch(PRIVATE_WORDS);
  if (minutesHidden) expect(text, "service minutes are on the page").not.toMatch(MINUTES_WORDS);
  if (lastNames) await expectNoLastNames(page, lastNames);
}

/** Every tab in the bar, in order, opened and checked. */
async function walkTabs(page: Page, lastNames: { last: string }[] | null, minutesHidden = false) {
  const links = tabBar(page).getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const link = tabBar(page).getByRole("link").nth(i);
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("main")).toBeVisible();
    await expectNothingPrivate(page, lastNames, minutesHidden);
  }
}

test.describe("what other roles never see", () => {
  test("a paraprofessional sees first names only and no private details on any tab or goal", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    const names = await directorNames(page);
    await signIn(page, "para");
    await expect(page.getByRole("heading", { name: "Your goals today", level: 2 })).toBeVisible();
    await expectNothingPrivate(page, names, true);
    await walkTabs(page, names, true);
    await tabBar(page).getByRole("link", { name: "Today" }).click();
    const start = page.getByRole("link", { name: "Start a session" }).first();
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.getByRole("region", { name: "Record data" })).toBeVisible();
    await expectNothingPrivate(page, names, true);
    expect(errors).toEqual([]);
  });

  test("a general-education teacher sees no birth dates or ids on any tab or student", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "gen_ed");
    await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
    await expectNothingPrivate(page, null);
    await walkTabs(page, null);
    await tabBar(page).getByRole("link", { name: "My students" }).click();
    await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
    const rows = page.locator("ul.pick > li a");
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      await expect(page.getByText(/Read only\./)).toBeVisible();
      await expectNothingPrivate(page, null);
      await page.getByRole("link", { name: "← My students" }).click();
      await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
