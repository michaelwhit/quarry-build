import { expect, test, type Page } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// The add-a-student and add-a-goal forms: what the page itself refuses, what the app refuses in
// plain words, and that a good entry lands on the student's page.
async function openAddStudent(page: Page) {
  await signIn(page, "director");
  await page.evaluate(() => {
    window.location.hash = "#/add-student";
  });
  await expect(page.getByRole("heading", { name: "Add a student" })).toBeVisible();
}

const alert = (page: Page) => page.getByRole("alert");

async function addStudentAndOpenGoalForm(page: Page) {
  await openAddStudent(page);
  await page.getByLabel("First name").fill("Sample");
  await page.getByLabel("Last name").fill("Learner");
  await page.getByRole("button", { name: "Add student" }).click();
  await expect(page).toHaveURL(/#\/student\//);
  await page.getByRole("link", { name: "Add a goal" }).click();
  await expect(page.getByRole("heading", { name: "Add a goal" })).toBeVisible();
}

test.describe("add a student", () => {
  test("names of only spaces are refused in plain words, then a good entry opens the student", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openAddStudent(page);
    await page.getByLabel("First name").fill("   ");
    await page.getByLabel("Last name").fill("   ");
    await page.getByRole("button", { name: "Add student" }).click();
    await expect(alert(page)).toHaveText("First and last name are required");
    await expect(page.getByRole("heading", { name: "Add a student" })).toBeVisible();

    await page.getByLabel("First name").fill("Sample");
    await page.getByLabel("Last name").fill("Learner");
    await page.getByLabel("Preferred name (optional)").fill("Sam");
    await page.getByLabel("Grade").selectOption("5");
    await page.getByRole("button", { name: "Add student" }).click();
    await expect(page).toHaveURL(/#\/student\//);
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Sam");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.locator("ul.cards .name")).toContainText(["Sam Learner"]);
    expect(errors).toEqual([]);
  });

  test("an empty name stops at the page before anything is saved, and names stop at 40 characters", async ({
    page,
  }) => {
    await openAddStudent(page);
    await page.getByRole("button", { name: "Add student" }).click();
    await expect(page.getByLabel("First name")).toBeFocused();
    await expect(page).toHaveURL(/#\/add-student$/);
    await page.getByLabel("First name").fill("A".repeat(60));
    await expect(page.getByLabel("First name")).toHaveValue("A".repeat(40));
  });
});

test.describe("add a goal", () => {
  test("a goal of only spaces and a target of zero are refused in plain words", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await addStudentAndOpenGoalForm(page);
    await page.getByLabel("Whole goal").fill("   ");
    await page.getByLabel("Baseline").fill("2 of 10");
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(alert(page)).toHaveText("The goal needs wording");

    await page.getByLabel("Whole goal").fill("Sample will read a short passage aloud.");
    await page.getByLabel("Target", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(alert(page)).toHaveText("The target must be a number above zero");
    await expect(page.getByRole("heading", { name: "Add a goal" })).toBeVisible();

    await page.getByLabel("Target", { exact: true }).fill("80");
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(page).toHaveURL(/#\/student\/[^/]+$/);
    await expect(page.getByText("Sample will read a short passage aloud.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a prompt-level goal needs two levels and a task analysis needs its steps", async ({
    page,
  }) => {
    await addStudentAndOpenGoalForm(page);
    await page.getByLabel("Whole goal").fill("Sample will wash hands with fewer prompts.");
    await page.getByLabel("Baseline").fill("full help");

    await page.getByLabel("How it is measured").selectOption({ label: "Prompt level" });
    await page.getByLabel("Prompt levels, most support first").fill("Independent");
    await page.getByLabel("Target level").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(alert(page)).toHaveText("Add at least two levels");

    await page.getByLabel("How it is measured").selectOption({ label: "Task analysis (steps)" });
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(alert(page)).toHaveText("Add the steps");

    await page.getByLabel("Steps (one per line)").fill("Turn on water\nUse soap\nRinse");
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(page).toHaveURL(/#\/student\/[^/]+$/);
    await expect(page.getByText("Sample will wash hands with fewer prompts.")).toBeVisible();
  });
});
