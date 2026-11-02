import { expect, test } from "@playwright/test";
import { signIn, watchErrors } from "./helpers.ts";

test("the tour shows once on Home, can be walked or skipped, and stays gone", async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, "director", { tour: true });
  const tour = page.getByRole("region", { name: "A quick look around" });
  await expect(tour).toContainText("Step 1 of 4");
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Step 2 of 4");
  await tour.getByRole("button", { name: "Back" }).click();
  await expect(tour).toContainText("Step 1 of 4");
  await tour.getByRole("button", { name: "Skip the tour" }).click();
  await expect(tour).toHaveCount(0);
  // A reload signs the practice account out; signing in again must not bring the tour back.
  await signIn(page, "director", { tour: true });
  await expect(page.getByRole("heading", { level: 2, name: "Home" })).toBeVisible();
  await expect(page.getByText("A quick look around")).toHaveCount(0);
  expect(errors).toEqual([]);
});
