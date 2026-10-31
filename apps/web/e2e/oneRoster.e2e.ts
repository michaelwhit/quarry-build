import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// A made-up OneRoster users.csv: one teacher, one deleted student, three students to add.
const USERS = [
  "sourcedId,status,enabledUser,role,givenName,familyName,email,grades",
  "u-1,active,true,student,Avery,Examplewood,avery@example.org,03",
  "u-2,active,true,teacher,Sam,Sampleton,sam@example.org,",
  "u-3,tobedeleted,true,student,Blake,Samplefield,,KG",
  "u-4,active,true,student,Casey,Teststone,,05",
  "u-5,active,true,student,Devon,Mockridge,,07",
  "",
].join("\n");

test.describe("OneRoster users file", () => {
  test("is read as a roster of students and added", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.getByRole("link", { name: "Import from file" }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "users.csv", mimeType: "text/csv", buffer: Buffer.from(USERS) });
    await expect(page.getByText(/^Read as a OneRoster users file: 3 students/)).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "3 to add, 0 already on the list, 0 to fix",
    );
    await expect(page.getByText("sam@example.org")).toHaveCount(0);
    await expect(page.getByText("Sampleton")).toHaveCount(0);
    await page.getByRole("button", { name: "Add students" }).click();
    await expect(page.getByRole("status")).toContainText("3 students added.");
    expect(errors).toEqual([]);
  });
});
