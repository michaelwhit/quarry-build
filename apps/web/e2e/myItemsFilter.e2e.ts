import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// "My items only" and "Favorites only" cannot both be on: while My items only is ticked the
// Favorites box is off and says why, so a ticked box never does nothing.
test("Favorites only is switched off, with a reason, while My items only is on", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "Libraries" }).click();
  await expect(page.getByRole("heading", { name: "Libraries" })).toBeVisible();

  const favorites = page.getByLabel(/^Favorites only/);
  const mine = page.getByLabel(/^My items only/);
  await expect(favorites).toBeEnabled();

  await mine.check();
  await expect(favorites).toBeDisabled();
  await expect(page.getByText("Turn off My items only to use Favorites only.")).toBeVisible();

  await mine.uncheck();
  await expect(favorites).toBeEnabled();
  await expect(page.getByText("Turn off My items only to use Favorites only.")).toHaveCount(0);
  expect(errors).toEqual([]);
});
