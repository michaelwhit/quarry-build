import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

const file = (text: string) => ({
  name: "export.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});

// A made-up export the way a spreadsheet program may save it: a title line, semicolons, one name
// column written "Last, First", and the grade spelled out.
const EXPORT = [
  "Caseload report (made up)",
  "",
  "Student Name;Grade Level;Nickname",
  '"Examplewood, Avery";Third;Ave',
  "Blake Samplefield;K;",
  '"Teststone, Casey";grade 03;',
  "",
].join("\n");

test.describe("flexible roster file", () => {
  test("a semicolon file with a title line and a full-name column is read and added", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.getByRole("link", { name: "Import from file" }).click();
    await page.locator('input[type="file"]').setInputFiles(file(EXPORT));
    await expect(
      page.getByText("The header row is on line 3. The lines above it were skipped."),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Full name in one column/ })).toHaveValue("0");
    await expect(page.getByRole("combobox", { name: /^Grade/ })).toHaveValue("1");
    await expect(page.getByRole("status")).toContainText(
      "3 to add, 0 already on the list, 0 to fix",
    );
    await expect(page.getByText("Avery Examplewood")).toBeVisible();
    await expect(page.getByText("Blake Samplefield")).toBeVisible();
    await expect(page.getByText("Casey Teststone")).toBeVisible();
    await page.getByRole("button", { name: "Add students" }).click();
    await expect(page.getByRole("status")).toContainText("3 students added.");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.locator("ul.cards .name")).toHaveText([
      "Ave Examplewood",
      "Blake Samplefield",
      "Casey Teststone",
    ]);
    expect(errors).toEqual([]);
  });

  test("a one-word name in the full-name column is a row to fix and is not added", async ({
    page,
  }) => {
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.getByRole("link", { name: "Import from file" }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(file("Name,Grade\nCher,4\nAvery Examplewood,3\n"));
    await expect(page.getByRole("status")).toContainText(
      "1 to add, 0 already on the list, 1 to fix",
    );
    await expect(page.getByText("No last name.")).toBeVisible();
    await page.getByRole("button", { name: "Add students" }).click();
    await expect(page.getByRole("status")).toContainText("1 student added.");
  });

  test("the first screen explains the file and the example file adds four made-up students", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.getByRole("link", { name: "Import from file" }).click();
    await expect(page.getByLabel("Steps").getByRole("listitem")).toHaveText([
      "Choose file",
      "Match columns",
      "Review and fix",
      "Add",
    ]);
    await expect(page.getByLabel("Steps").locator('[aria-current="step"]')).toHaveText(
      "Choose file",
    );
    await expect(page.getByText(/Delete the downloaded file when you are done/)).toBeVisible();
    await page.getByRole("button", { name: "Try a made-up example file" }).click();
    await expect(page.getByLabel("Steps").locator('[aria-current="step"]')).toHaveText(
      "Match columns",
    );
    await expect(page.getByRole("status")).toContainText(
      "4 to add, 0 already on the list, 0 to fix",
    );
    await page.getByRole("button", { name: "Add students" }).click();
    await expect(page.getByRole("status")).toContainText("4 students added.");
    await expect(page.getByLabel("Steps").locator('[aria-current="step"]')).toHaveText("Add");
    expect(errors).toEqual([]);
  });

  test("the example file clears an earlier error message", async ({ page }) => {
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.getByRole("link", { name: "Import from file" }).click();
    await page.locator('input[type="file"]').setInputFiles(file(""));
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Try a made-up example file" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("4 to add");
  });
});
