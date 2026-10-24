import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

test.describe("student page sections", () => {
  test("the buttons open each section, Behavior keeps the BIP upload off, and Accommodations lists the supports", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator("ul.cards .name").first().click();

    const nav = page.getByRole("navigation", { name: "Student sections" });
    for (const name of [
      "Goals",
      "Accommodations / modifications",
      "Present levels",
      "Services",
      "Behavior",
      "Edit student",
    ])
      await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Goals" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Assign from library" })).toBeVisible();

    await nav.getByRole("link", { name: "Accommodations / modifications" }).click();
    await expect(page.getByRole("region", { name: "Accommodations" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Student sections" }).getByRole("link", {
        name: "Accommodations / modifications",
      }),
    ).toHaveAttribute("aria-current", "page");

    await page
      .getByRole("navigation", { name: "Student sections" })
      .getByRole("link", { name: "Behavior" })
      .click();
    const upload = page.getByRole("button", { name: "Upload a BIP" });
    await expect(upload).toBeDisabled();
    await expect(page.getByText(/waits for the security review/)).toBeVisible();

    await page
      .getByRole("navigation", { name: "Student sections" })
      .getByRole("link", { name: "Services" })
      .click();
    await expect(page.getByRole("heading", { name: "Services", level: 2 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("an address with a broken student id shows the unknown-student screen, not a crash", async ({
    page,
  }) => {
    await signIn(page, "director");
    await page.evaluate(() => {
      window.location.hash = "#/student/%E0%A4%A/behavior";
    });
    await expect(page.getByText(/not here|no longer|not found/i).first()).toBeVisible();
  });
});
