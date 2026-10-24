import { expect, test } from "@playwright/test";
import { signIn, signOut, tabBar, watchErrors } from "./helpers.ts";

// The web backup run in the demo script: the director loads the sample students from More, a
// second tap asks before replacing, and the para list is not empty afterwards.
test.describe("loading the sample students for the demo", () => {
  test("the first tap loads them, the second asks first, and the para then has goals", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "More" }).click();
    const load = page.getByRole("button", { name: "Load sample students" });
    await load.click();
    await expect(page.getByText(/12 students/)).toBeVisible();

    // Add a student of our own so a real replace changes the count (13 back to 12).
    await page.evaluate(() => {
      window.location.hash = "#/add-student";
    });
    await page.getByLabel("First name").fill("Extra");
    await page.getByLabel("Last name").fill("Student");
    await page.getByRole("button", { name: "Add student" }).click();
    await tabBar(page).getByRole("link", { name: "More" }).click();
    const practice = page.getByRole("heading", { name: "Practice data" }).locator("..");
    await expect(practice).toContainText("13 students");

    await load.click();
    await expect(page.getByRole("button", { name: "Replace with sample students" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Replace with sample students" })).toHaveCount(0);
    await load.click();
    await expect(practice).toContainText("13 students");
    await page.getByRole("button", { name: "Replace with sample students" }).click();
    await expect(practice).toContainText("12 students");
    await expect(practice).not.toContainText("13 students");
    await expect(page.getByRole("button", { name: "Replace with sample students" })).toHaveCount(0);

    await signOut(page);
    await signIn(page, "para");
    await tabBar(page).getByRole("link", { name: "Today" }).click();
    await expect(page.getByRole("heading", { name: "Your goals today", level: 2 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a session" }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
