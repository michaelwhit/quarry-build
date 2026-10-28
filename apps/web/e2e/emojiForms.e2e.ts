import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// An emoji is one character to a person but two UTF-16 units, so a limit that counts units would
// stop a 40-emoji name at 20 (and could cut one in half). The forms count characters.
const EMOJI = "😀";

async function openAddStudent(page: import("@playwright/test").Page) {
  await signIn(page, "director");
  await page.evaluate(() => {
    window.location.hash = "#/add-student";
  });
  await expect(page.getByRole("heading", { name: "Add a student" })).toBeVisible();
}

test("a 40-emoji name is kept whole, a 41st is not typed, and the student is saved with 40", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openAddStudent(page);
  await page.getByLabel("First name").fill(EMOJI.repeat(40));
  await expect(page.getByLabel("First name")).toHaveValue(EMOJI.repeat(40));
  await page.getByLabel("Last name").fill(EMOJI.repeat(41));
  await expect(page.getByLabel("Last name")).toHaveValue(EMOJI.repeat(40));
  await page.getByLabel("Preferred name (optional)").fill(`${EMOJI.repeat(39)}ab`);
  await expect(page.getByLabel("Preferred name (optional)")).toHaveValue(`${EMOJI.repeat(39)}a`);
  await page.getByRole("button", { name: "Add student" }).click();
  await expect(page).toHaveURL(/#\/student\//);
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  const shown = await page.locator("ul.cards .name").first().innerText();
  expect([...shown].every((c) => c !== "�")).toBe(true);
  expect(errors).toEqual([]);
});

test("the goal fields keep their last emoji whole at the limit", async ({ page }) => {
  await openAddStudent(page);
  await page.getByLabel("First name").fill("Sample");
  await page.getByLabel("Last name").fill("Learner");
  await page.getByRole("button", { name: "Add student" }).click();
  await expect(page).toHaveURL(/#\/student\//);
  await page.getByRole("link", { name: "Add a goal" }).click();
  await expect(page.getByRole("heading", { name: "Add a goal" })).toBeVisible();
  await page.getByLabel("Baseline").fill(EMOJI.repeat(201));
  await expect(page.getByLabel("Baseline")).toHaveValue(EMOJI.repeat(200));
  await page.getByLabel("Criteria").fill(EMOJI.repeat(301));
  await expect(page.getByLabel("Criteria")).toHaveValue(EMOJI.repeat(300));
  await page.getByLabel("Whole goal").fill(EMOJI.repeat(801));
  await expect(page.getByLabel("Whole goal")).toHaveValue(EMOJI.repeat(800));
});
