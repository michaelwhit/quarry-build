import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// Present levels and the evaluation timeline count characters, not UTF-16 units: a label of 60
// emoji is not "too long", and a box that holds 400 characters takes 400 emoji.
const EMOJI = "😀";

test("present levels fields keep whole emoji at their limits", async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "More" }).click();
  await page.getByRole("button", { name: "Load sample students" }).click();
  await expect(page.getByText(/12 students/)).toBeVisible();
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  await page.locator('a[href*="#/student/"]').first().click();
  await page.getByRole("link", { name: "Present levels" }).click();
  await expect(page.getByRole("heading", { name: "Present levels", level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "+ Add a score" }).click();
  await page.getByLabel(/^Test or instrument/).fill(EMOJI.repeat(121));
  await expect(page.getByLabel(/^Test or instrument/)).toHaveValue(EMOJI.repeat(120));
  await page.getByLabel(/^Measure/).fill(EMOJI.repeat(121));
  await expect(page.getByLabel(/^Measure/)).toHaveValue(EMOJI.repeat(120));
  await page.getByLabel(/^Label printed in the report/).fill(EMOJI.repeat(61));
  await expect(page.getByLabel(/^Label printed in the report/)).toHaveValue(EMOJI.repeat(60));
  await page.getByLabel(/^Label printed in the report/).fill(EMOJI.repeat(60));
  await expect(page.getByText("The printed label is too long.")).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel" }).first().click();
  await page.getByRole("button", { name: "+ Add a need or strength" }).first().click();
  await page.getByLabel(/^In your words/).fill(EMOJI.repeat(401));
  await expect(page.getByLabel(/^In your words/)).toHaveValue(EMOJI.repeat(400));
  expect(errors).toEqual([]);
});

test("the no-school days box on the evaluation timeline keeps whole emoji at 2000", async ({
  page,
}) => {
  await signIn(page, "director");
  await page.evaluate(() => {
    window.location.hash = "#/meeting-notices";
  });
  await page.getByRole("button", { name: "Evaluation timeline" }).click();
  await page.getByLabel("No-school days").fill(EMOJI.repeat(2001));
  await expect(page.getByLabel("No-school days")).toHaveValue(EMOJI.repeat(2000));
});
