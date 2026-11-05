import { expect, test } from "@playwright/test";
import { noHorizontalScroll, signIn, tabBar, watchErrors } from "./helpers.ts";

test("More opens Help, which names the page and keeps More current", async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "More" }).click();
  await page.getByRole("link", { name: "Open Help" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Help" })).toBeVisible();
  await expect(page).toHaveTitle("Help · GoalLine");
  await expect(tabBar(page).getByRole("link", { name: "More" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("Ask your case manager first.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("More opens the accessibility statement", async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "More" }).click();
  await page.getByRole("link", { name: "Accessibility" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accessibility" })).toBeVisible();
  await expect(page).toHaveTitle("Accessibility · GoalLine");
  expect(errors).toEqual([]);
});

for (const width of [320, 390]) {
  test(`Help and Accessibility fit a ${width}px phone with large text`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height: 800 });
    await signIn(page, "case_manager");
    for (const [hash, name] of [
      ["#/help", "Help"],
      ["#/accessibility", "Accessibility"],
    ] as const) {
      await page.evaluate((h) => {
        window.location.hash = h;
      }, hash);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
      await expect(page).toHaveTitle(`${name} · GoalLine`);
      await noHorizontalScroll(page);
      // Set through the DOM: the page policy refuses injected style elements.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
}
