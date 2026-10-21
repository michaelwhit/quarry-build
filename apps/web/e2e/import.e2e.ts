import { expect, test } from "@playwright/test";
import {
  type RoleKey,
  loadSamplesAsDirector,
  signIn,
  signOut,
  tabBar,
  watchErrors,
} from "./helpers.ts";

const csv = (text: string, name = "roster.csv") => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});
const GOOD = "First name,Last name,Grade\nAvery,Examplewood,3\nBlake,Samplefield,K\n";

async function openImport(page: import("@playwright/test").Page) {
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  await page.getByRole("link", { name: "Import from file" }).click();
  await expect(page.getByRole("heading", { name: "Import students", level: 2 })).toBeVisible();
}

test.describe("CSV roster import", () => {
  test("the director sees Import from file on the caseload; the SLP does not", async ({ page }) => {
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.getByRole("link", { name: "Import from file" })).toBeVisible();
    await signOut(page);
    await signIn(page, "slp");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.getByRole("link", { name: "Import from file" })).toHaveCount(0);
  });

  test("the SLP, para and gen-ed teacher cannot open the import address", async ({ page }) => {
    await loadSamplesAsDirector(page);
    for (const role of ["slp", "para", "gen_ed"] as RoleKey[]) {
      await signIn(page, role);
      await page.evaluate(() => (window.location.hash = "#/import-students"));
      await expect(page.getByRole("heading", { name: "Import students" })).toHaveCount(0);
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      if (role === "slp")
        await expect(
          page.getByRole("heading", { name: "Not available for this role" }),
        ).toBeVisible();
      await signOut(page);
    }
  });

  // Intended (confirmed by the PM): import is open to the director and the case manager, who can
  // also add students by hand; the SLP, para and gen-ed teacher cannot.
  test("the case manager can import because it can add students", async ({ page }) => {
    await signIn(page, "case_manager");
    await openImport(page);
  });

  test("a good file is previewed, added once confirmed, and shows on the caseload", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await openImport(page);
    await page.locator('input[type="file"]').setInputFiles(csv(GOOD));
    await expect(page.getByText("roster.csv")).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "2 to add, 0 already on the list, 0 to fix",
    );
    await expect(page.getByText("Avery Examplewood")).toBeVisible();
    await expect(page.getByText("Blake Samplefield")).toBeVisible();
    // Nothing is added until confirmed.
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.getByText("Avery Examplewood")).toHaveCount(0);
    await page.getByRole("link", { name: "Import from file" }).click();
    await page.locator('input[type="file"]').setInputFiles(csv(GOOD));
    await page.getByRole("button", { name: "Add students" }).click();
    await expect(page.getByRole("status")).toContainText("2 students added.");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.locator("ul.cards .name")).toHaveText([
      "Avery Examplewood",
      "Blake Samplefield",
    ]);
    expect(errors).toEqual([]);
  });

  test("importing the same file again skips the duplicates", async ({ page }) => {
    await signIn(page, "director");
    await openImport(page);
    await page.locator('input[type="file"]').setInputFiles(csv(GOOD));
    await page.getByRole("button", { name: "Add students" }).click();
    await expect(page.getByRole("status")).toContainText("2 students added.");
    await page.locator('input[type="file"]').setInputFiles(csv(GOOD));
    await expect(page.getByRole("status")).toContainText(
      "0 to add, 2 already on the list, 0 to fix",
    );
    await expect(page.getByRole("button", { name: "Add students" })).toBeDisabled();
  });

  test("a row with a problem names its line, and only the good rows are added", async ({
    page,
  }) => {
    await signIn(page, "director");
    await openImport(page);
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        csv(
          "First name,Last name,Grade\nAvery,Examplewood,3\nBlake,Samplefield,13\n,Missingfirst,2\n",
        ),
      );
    await expect(page.getByRole("status")).toContainText(
      "1 to add, 0 already on the list, 2 to fix",
    );
    await expect(page.getByText("line 3")).toBeVisible();
    await expect(page.getByText("line 4")).toBeVisible();
    await expect(page.getByText(/is not one of PK, K or 1 to 12/)).toBeVisible();
    await expect(page.getByText("No first name.")).toBeVisible();
    await page.getByRole("button", { name: "Add students" }).click();
    await expect(page.getByRole("status")).toContainText("1 student added.");
  });

  test("columns that are named differently can be matched by hand", async ({ page }) => {
    await signIn(page, "director");
    await openImport(page);
    await page
      .locator('input[type="file"]')
      .setInputFiles(csv("Kid,Family,Level\nAvery,Examplewood,3\n"));
    await expect(
      page.getByText("Choose a column for first name, last name and grade."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add students" })).toHaveCount(0);
    const selects = page.locator("form select");
    await selects.nth(0).selectOption({ label: "Kid" });
    await selects.nth(1).selectOption({ label: "Family" });
    await selects.nth(3).selectOption({ label: "Level" });
    await expect(page.getByRole("status")).toContainText("1 to add");
  });

  test("a file that is not a roster, or is too big, shows a clear message and adds nothing", async ({
    page,
  }) => {
    await signIn(page, "director");
    await openImport(page);
    await page.locator('input[type="file"]').setInputFiles(csv("", "empty.csv"));
    await expect(page.getByRole("alert")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "big.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(1_100_000, "a"),
    });
    await expect(page.getByRole("alert")).toContainText("larger than 1 MB");
    await expect(page.getByRole("button", { name: "Add students" })).toHaveCount(0);
  });
});
