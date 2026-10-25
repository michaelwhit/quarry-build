import { expect, test, type Page } from "@playwright/test";
import { recordSimpleSession, signIn, tabBar, watchErrors } from "./helpers.ts";

// Editing and deleting: a student's name and grade, a goal's wording (its way of measuring is
// locked), the two-step delete questions, and removing one saved session.
async function newStudentWithGoal(page: Page): Promise<string> {
  await page.evaluate(() => {
    window.location.hash = "#/add-student";
  });
  await page.getByLabel("First name").fill("Sample");
  await page.getByLabel("Last name").fill("Learner");
  await page.getByRole("button", { name: "Add student" }).click();
  await page.getByRole("link", { name: "Add a goal" }).click();
  await page.getByLabel("Whole goal").fill("Sample will read a short passage aloud.");
  await page.getByLabel("Baseline").fill("2 of 10");
  await page.getByRole("button", { name: "Add goal" }).click();
  return page.evaluate(() => window.location.hash);
}

test.describe("edit and delete", () => {
  test("editing a student changes the name and grade, and Cancel keeps the student", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    const student = await newStudentWithGoal(page);
    await page.getByRole("link", { name: "Edit student" }).click();
    await expect(page.getByRole("heading", { name: "Edit student" })).toBeVisible();
    await page.getByLabel("First name").fill("Sam");
    await page.getByLabel("Grade").selectOption("6");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("main")).toContainText(/Grade 6/);
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.locator("ul.cards .name")).toHaveText(["Sam Learner"]);

    await page.evaluate((h) => {
      window.location.hash = `${h}/edit`;
    }, student);
    await page.getByRole("button", { name: "Delete this student" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: /^Yes, delete the student/ })).toHaveCount(0);
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.locator("ul.cards .name")).toHaveText(["Sam Learner"]);
    expect(errors).toEqual([]);
  });

  test("a goal's wording can change but not how it is measured, and a goal can be deleted", async ({
    page,
  }) => {
    await signIn(page, "director");
    const student = await newStudentWithGoal(page);
    await page.getByRole("link", { name: "Edit goal" }).click();
    await expect(page.getByLabel("How it is measured")).toBeDisabled();
    await page.getByLabel("Whole goal").fill("Sample will read two passages aloud.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Sample will read two passages aloud.")).toBeVisible();
    await expect(page.getByText("Sample will read a short passage aloud.")).toHaveCount(0);

    await page.getByRole("link", { name: "Edit goal" }).click();
    await page.getByRole("button", { name: "Delete this goal" }).click();
    await page.getByRole("button", { name: "Yes, delete the goal and its data" }).click();
    await expect(page).toHaveURL(new RegExp(`${student}$`));
    await expect(page.getByText("No goals yet.")).toBeVisible();
  });

  test("deleting a student asks first and then removes them from the caseload", async ({
    page,
  }) => {
    await signIn(page, "director");
    const student = await newStudentWithGoal(page);
    await page.evaluate((h) => {
      window.location.hash = `${h}/edit`;
    }, student);
    await page.getByRole("button", { name: "Delete this student" }).click();
    await page
      .getByRole("button", { name: "Yes, delete the student and all their goals and data" })
      .click();
    await expect(page.getByRole("heading", { name: "Caseload" }).first()).toBeVisible();
    await expect(page.locator("ul.cards .name")).toHaveCount(0);
  });

  test("one saved session can be removed from History, and the data table loses that row", async ({
    page,
  }) => {
    await signIn(page, "director");
    await newStudentWithGoal(page);
    const track = await page
      .locator('a[href*="#/track/"]')
      .first()
      .getAttribute("href")
      .then((h) => h!);
    for (let i = 0; i < 2; i++) {
      await page.evaluate((h) => {
        window.location.hash = h;
      }, track);
      expect(await recordSimpleSession(page)).toBe(true);
    }
    const rows = page.locator("section[aria-label='History'] ul.history li");
    await expect(rows).toHaveCount(2);
    await rows.first().getByRole("button", { name: "Remove" }).click();
    await rows.first().getByRole("button", { name: "Cancel" }).click();
    await expect(rows).toHaveCount(2);
    await rows.first().getByRole("button", { name: "Remove" }).click();
    await rows.first().getByRole("button", { name: "Yes, remove this session" }).click();
    await expect(rows).toHaveCount(1);
    await page.locator("details summary", { hasText: "Data table" }).click();
    await expect(page.locator("details table tbody tr")).toHaveCount(1);
  });
});
