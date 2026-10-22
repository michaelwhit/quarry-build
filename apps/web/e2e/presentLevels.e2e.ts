import { expect, test, type Page } from "@playwright/test";
import { signIn, signOut, tabBar, type RoleKey } from "./helpers.ts";

// Present levels in the practice app: evidence the teacher confirms, an offline drafter, and an
// approval per section. Made-up students and made-up scores only.

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

/** The first caseload student's page address, read as the director. */
async function firstStudentPath(page: Page): Promise<string> {
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  const href = await page.locator('a[href*="#/student/"]').first().getAttribute("href");
  expect(href).toMatch(/#\/student\/[^/]+$/);
  return href ?? "";
}

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("the director confirms evidence, drafts the sections, and approves one", async ({ page }) => {
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "More" }).click();
  await page.getByRole("button", { name: "Load sample students" }).click();
  await expect(page.getByText(/12 students/)).toBeVisible();
  const student = await firstStudentPath(page);
  await page.goto(student);
  await page.getByRole("link", { name: "Present levels" }).click();
  await expect(page.getByRole("heading", { name: "Present levels", level: 2 })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Practice only");

  // A score that does not fit its type cannot be saved.
  await page.getByRole("button", { name: "+ Add a score" }).click();
  const save = page.getByRole("button", { name: "This matches the report" });
  await expect(save).toBeDisabled();
  await expect(page.getByText("Name the measure.")).toBeVisible();
  await page.getByLabel("Section").selectOption("evaluation");
  await page.getByLabel(/^Measure/).fill("Reading Fluency");
  await page.getByLabel(/^Score, as printed/).fill("500");
  await page.getByLabel(/^Date given/).fill(yesterday());
  await expect(page.getByText(/A standard score is from/)).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByLabel(/^Score, as printed/).fill("85");
  await page.getByLabel(/^Test or instrument/).fill("Acadience ORF");
  await page.getByLabel(/^Percentile/).fill("16");
  await page.getByLabel(/^Label printed in the report/).fill("Below Average");
  await save.click();
  await expect(
    page.getByText(
      /Reading Fluency \(Acadience ORF\): standard score 85, percentile 16, "Below Average"/,
    ),
  ).toBeVisible();

  // A strength, then what is still missing.
  await page.getByRole("button", { name: "+ Add a need or strength" }).click();
  await page.getByLabel("Kind").selectOption("strength");
  await page.getByLabel(/^In your words/).fill("Enjoys read-alouds with a partner.");
  await page.getByRole("button", { name: "This matches the report" }).click();
  const required = page.getByRole("region", { name: "Required content" });
  await expect(required).toContainText("Covered: Academic achievement");
  await expect(required).toContainText("Covered: Strengths");
  await expect(required).toContainText("Still missing: Parent or student concerns and vision");

  // The drafter writes the sentences; the numbers and the report's label come from the score.
  await page.getByRole("button", { name: "Draft the sections" }).click();
  const strengths = section(page, "Student Strengths");
  await expect(strengths.getByRole("textbox")).toHaveValue(/enjoys read-alouds with a partner/i);
  const results = page.getByRole("region", {
    name: /^Results of Initial or Most Recent Evaluation/,
  });
  await expect(results.getByRole("textbox")).toHaveValue(/Reading Fluency.*85.*16.*Below Average/s);
  await expect(strengths).toContainText("Draft saved");

  // Approving locks the words until the teacher reopens the section.
  await strengths.getByRole("button", { name: "Approve this section" }).click();
  await expect(strengths).toContainText("Approved");
  await expect(strengths.getByRole("textbox")).toBeDisabled();
  await strengths.getByRole("button", { name: "Edit again" }).click();
  await expect(strengths.getByRole("textbox")).toBeEnabled();
  await expect(page.getByRole("region", { name: "History" })).not.toContainText("Nothing yet.");

  // The work is kept in this browser: sign out, sign in again, open the same page.
  await signOut(page);
  await signIn(page, "director");
  await page.goto(`${student}/present-levels`);
  await expect(page.getByRole("heading", { name: "Present levels", level: 2 })).toBeVisible();
  await expect(page.locator("ul.eval-preview li").first()).toContainText(
    "Reading Fluency (Acadience ORF)",
  );
  await expect(section(page, "Student Strengths").getByRole("textbox")).toHaveValue(
    /enjoys read-alouds/i,
  );
});

test("a score can be edited and removed", async ({ page }) => {
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "More" }).click();
  await page.getByRole("button", { name: "Load sample students" }).click();
  await page.goto(await firstStudentPath(page));
  await page.getByRole("link", { name: "Present levels" }).click();
  await expect(page.getByText("Nothing yet.").first()).toBeVisible();
  await page.getByRole("button", { name: "+ Add a score" }).click();
  await page.getByLabel(/^Measure/).fill("Math Facts");
  await page.getByLabel(/^Score, as printed/).fill("90");
  await page.getByLabel(/^Date given/).fill(yesterday());
  await page.getByRole("button", { name: "This matches the report" }).click();
  await page.getByRole("button", { name: "Edit score: Math Facts" }).click();
  await expect(page.getByText("Edit score")).toBeVisible();
  await page.getByLabel(/^Measure/).fill("Math Facts B");
  await page.getByRole("button", { name: "This matches the report" }).click();
  await expect(page.getByText(/Math Facts B: standard score 90/)).toBeVisible();
  await page.getByRole("button", { name: "Remove score: Math Facts B" }).click();
  await expect(page.locator("ul.eval-preview li")).toHaveCount(0);
});

test.describe("who can open it", () => {
  const allowed: RoleKey[] = ["director", "case_manager", "slp"];
  const refused: RoleKey[] = ["para", "gen_ed"];

  for (const role of allowed)
    test(`${role} can open present levels from their caseload`, async ({ page }) => {
      await signIn(page, "director");
      await tabBar(page).getByRole("link", { name: "More" }).click();
      await page.getByRole("button", { name: "Load sample students" }).click();
      await signOut(page);
      await signIn(page, role);
      await page.goto(`${await firstStudentPath(page)}/present-levels`);
      await expect(page.getByRole("heading", { name: "Present levels", level: 2 })).toBeVisible();
    });

  for (const role of refused)
    test(`${role} gets no present levels, even from the address`, async ({ page }) => {
      await signIn(page, "director");
      await tabBar(page).getByRole("link", { name: "More" }).click();
      await page.getByRole("button", { name: "Load sample students" }).click();
      const student = await firstStudentPath(page);
      await signOut(page);
      await signIn(page, role);
      await page.goto(`${student}/present-levels`);
      // Their own screen shows instead, and nothing of the form.
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Present levels" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "+ Add a score" })).toHaveCount(0);
    });
});
