import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

// The family summary: reached from the student page, shown in English or Spanish, and Copy and
// Print stay off until the teacher ticks that it is right. Changing the language clears the tick.
test("the family summary needs a read-and-approve tick before Copy and Print, in either language", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await loadSamplesAsDirector(page);
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  await page.locator("ul.cards .name").first().click();
  await page.getByRole("link", { name: "Family summary" }).click();

  await expect(page.getByRole("heading", { name: "Family summary" })).toBeVisible();
  await expect(page.getByText("is doing on IEP goals")).toBeVisible();
  const copy = page.getByRole("button", { name: "Copy text" });
  const print = page.getByRole("button", { name: "Print" });
  await expect(copy).toBeDisabled();
  await expect(print).toBeDisabled();

  const tick = page.getByLabel("I read this and it is right to share with the family");
  await tick.check();
  await expect(copy).toBeEnabled();
  await expect(print).toBeEnabled();

  await page.getByLabel("Language").selectOption("es");
  await expect(page.getByText("Cómo va ")).toBeVisible();
  await expect(page.getByText("The Spanish wording is a draft")).toBeVisible();
  await expect(tick).not.toBeChecked();
  await expect(copy).toBeDisabled();
  expect(errors).toEqual([]);
});

// Typing the address by hand: only the director and case managers get the page. A provider is told
// it is not available; paras and gen-ed teachers never reach it (their screens are limited).
for (const role of ["slp", "para", "gen_ed"] as const) {
  test(`${role} cannot open the family summary by address`, async ({ page }) => {
    await signIn(page, role);
    await page.evaluate(() => {
      window.location.hash = "#/student/s1/family-summary";
    });
    await expect(page.getByRole("heading", { name: "Family summary" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy text" })).toHaveCount(0);
    if (role === "slp")
      await expect(
        page.getByRole("heading", { name: "Not available for this role" }),
      ).toBeVisible();
  });
}
