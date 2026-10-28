import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// Text boxes outside the add forms count characters too: the library's accommodation fields and
// the quick note on the Track screen. 200 emoji fit, the 201st is not typed.
const EMOJI = "😀";

test("the accommodation fields and the quick note keep whole emoji at 200", async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, "director");
  await page.evaluate(() => {
    window.location.hash = "#/add-student";
  });
  await page.getByLabel("First name").fill("Sample");
  await page.getByLabel("Last name").fill("Learner");
  await page.getByRole("button", { name: "Add student" }).click();
  await expect(page).toHaveURL(/#\/student\//);

  await tabBar(page).getByRole("link", { name: "Libraries" }).click();
  await page.getByRole("button", { name: "Accommodations", exact: true }).click();
  await page
    .getByRole("list", { name: "Accommodations" })
    .locator("li.lib-item > button")
    .nth(1)
    .click();
  const detail = page.locator("section.lib-detail");
  for (const label of ["Location", "Frequency", "Duration"]) {
    await detail.getByLabel(label).fill(EMOJI.repeat(201));
    await expect(detail.getByLabel(label)).toHaveValue(EMOJI.repeat(200));
  }

  await page.getByRole("button", { name: "Goals", exact: true }).click();
  await page.getByLabel("Draft for a student").selectOption({ label: "Sample Learner" });
  await page
    .getByRole("button", { name: /^One tap: add to / })
    .first()
    .click();
  await page.locator("p.lib-note").getByRole("link", { name: "Start collecting data" }).click();
  await page.getByLabel("Quick note (optional)").fill(EMOJI.repeat(201));
  await expect(page.getByLabel("Quick note (optional)")).toHaveValue(EMOJI.repeat(200));
  expect(errors).toEqual([]);
});
