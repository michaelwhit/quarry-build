import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

test.describe("student services page", () => {
  test("a frequency of 'as needed' is refused with a reason, and a count is accepted", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator("ul.cards .name").first().click();
    await page.getByRole("link", { name: "Services" }).click();
    await expect(page.getByRole("heading", { name: "Services", level: 2 })).toBeVisible();

    // With nothing typed yet the button says why it is off.
    await expect(page.getByRole("button", { name: "Add row" })).toHaveAccessibleDescription(
      "Name the service.",
    );

    await page.getByLabel("Service", { exact: true }).fill("Practice reading help");
    await page.getByLabel("Start date").fill("2026-09-01");
    await page.getByLabel("Frequency").fill("as needed");
    await page.getByLabel("Duration").fill("15 min/day");
    await page.getByLabel("Location").fill("Resource room");
    await expect(page.getByRole("note").filter({ hasText: 'not "as needed"' })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add row" })).toBeDisabled();

    await page.getByLabel("Frequency").fill("3 days/week");
    await expect(page.getByRole("button", { name: "Add row" })).toBeEnabled();
    await page.getByRole("button", { name: "Add row" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Added Practice reading help." }),
    ).toHaveCount(1);
    await expect(page.getByText("No services added yet.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Practice reading help" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
