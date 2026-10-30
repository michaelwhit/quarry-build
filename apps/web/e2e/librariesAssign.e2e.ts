import { expect, test, type Page } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// Assigning from the library: a one-tap goal goes onto the chosen student, "as needed" is refused
// for an accommodation, and a good accommodation lands on the student's accommodations page.
async function newStudent(page: Page): Promise<string> {
  await page.evaluate(() => {
    window.location.hash = "#/add-student";
  });
  await page.getByLabel("First name").fill("Sample");
  await page.getByLabel("Last name").fill("Learner");
  await page.getByRole("button", { name: "Add student" }).click();
  await expect(page).toHaveURL(/#\/student\//);
  return page.evaluate(() => /#\/student\/([^/]+)/.exec(window.location.hash)![1]!);
}

test.describe("assign from the library", () => {
  test("a one-tap goal is added to the chosen student and no longer offered", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    const id = await newStudent(page);
    await tabBar(page).getByRole("link", { name: "Libraries" }).click();
    await page.getByLabel("Draft for a student").selectOption({ label: "Sample Learner" });
    const oneTap = page.getByRole("button", { name: /^One tap: add to / });
    const before = await oneTap.count();
    expect(before).toBeGreaterThan(0);
    const item = page.locator("li.lib-item").filter({ has: oneTap.first() }).first();
    const title = await item.locator("strong").first().innerText();
    await oneTap.first().click();
    const note = page.locator("p.lib-note");
    await expect(note).toContainText(`Added "${title}" to Sample Learner's goals.`);
    await expect(note.getByRole("link", { name: "Start collecting data" })).toHaveAttribute(
      "href",
      /#\/track\/[^/]+\/[^/]+$/,
    );
    await expect(oneTap).toHaveCount(before - 1);

    await page.evaluate((h) => {
      window.location.hash = h;
    }, `#/student/${id}`);
    await expect(page.getByText("No goals yet.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Track this goal" })).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("an accommodation that says as needed is refused, and a good one is added", async ({
    page,
  }) => {
    await signIn(page, "director");
    const id = await newStudent(page);
    await tabBar(page).getByRole("link", { name: "Libraries" }).click();
    await page.getByRole("button", { name: "Accommodations", exact: true }).click();
    await page
      .getByRole("list", { name: "Accommodations" })
      .locator("li.lib-item > button")
      .nth(1)
      .click();
    const detail = page.locator("section.lib-detail");
    const title = await detail.locator("h3").innerText();
    const add = detail.getByRole("button", { name: "Add to student", exact: true });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAccessibleDescription("Choose a student above to turn this on.");
    await detail.getByLabel("Add to student").selectOption({ label: "Sample Learner" });
    await expect(add).toBeEnabled();

    await detail.getByLabel("Frequency").fill("As needed");
    await expect(detail.getByRole("alert")).toHaveText(
      '"As needed" is not allowed. Say how many times and how often.',
    );
    await expect(add).toBeDisabled();
    await expect(add).toHaveAccessibleDescription(/As needed/);

    await detail.getByLabel("Frequency").fill("Every timed test");
    await expect(detail.getByRole("alert")).toHaveCount(0);
    await add.click();
    await expect(detail.getByRole("status")).toHaveText("Added to Sample Learner.");

    await page.evaluate((h) => {
      window.location.hash = h;
    }, `#/student/${id}/accommodations`);
    await expect(page.locator("main")).toContainText(title);
    await expect(page.locator("main")).toContainText("Every timed test");
  });
});
