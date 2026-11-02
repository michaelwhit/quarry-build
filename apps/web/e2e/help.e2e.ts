import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

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
