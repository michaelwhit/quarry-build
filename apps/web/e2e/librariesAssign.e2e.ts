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

  test("an accommodation's own wording is saved to My items, found by the filter, and removed", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Libraries" }).click();
    await page.getByRole("button", { name: "Accommodations", exact: true }).click();
    await page
      .getByRole("list", { name: "Accommodations" })
      .locator("li.lib-item > button")
      .nth(1)
      .click();
    const detail = page.locator("section.lib-detail");
    const title = await detail.locator("h3").innerText();
    await detail.getByLabel("Frequency").fill("Every timed test");
    await detail.getByRole("button", { name: "Save to My items" }).click();
    await expect(detail.getByRole("status")).toHaveText(`Saved "${title}" to My items.`);
    await detail.getByRole("button", { name: "Save to My items" }).click();
    await expect(detail.getByRole("status")).toHaveText("That wording is already in My items.");

    await page.getByLabel(/^My items only/).check();
    const mine = page.getByRole("list", { name: "Accommodations" }).locator("li.lib-item");
    await expect(mine).toHaveCount(1);
    await expect(mine.first()).toContainText("My item ·");
    await mine.first().locator("button").first().click();
    await expect(detail.getByLabel("Frequency")).toHaveValue("Every timed test");
    const rename = detail.getByRole("button", { name: "Rename", exact: true });
    await expect(rename).toBeDisabled();
    await expect(rename).toHaveAccessibleDescription("Change the name to turn Rename on.");
    await detail.getByLabel("Name in My items").fill("Extra time on tests");
    await rename.click();
    await expect(detail.getByText('Renamed to "Extra time on tests".')).toBeVisible();
    await detail.getByRole("button", { name: "Make a copy" }).click();
    await expect(page.locator("p.lib-note")).toContainText(
      'Saved a copy of "Extra time on tests" and opened it.',
    );
    await expect(detail.locator("h3")).toHaveText("Extra time on tests (copy)");
    await detail.getByRole("button", { name: "Remove from My items" }).click();
    await detail.getByRole("button", { name: "Yes, remove it from My items" }).click();
    await expect(page.locator("p.lib-note")).toContainText(
      'Removed "Extra time on tests (copy)" from My items.',
    );
    await expect(mine).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("several accommodations are ticked and added to one student, and a repeat is left out", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    const id = await newStudent(page);
    await tabBar(page).getByRole("link", { name: "Libraries" }).click();
    await page.getByRole("button", { name: "Accommodations", exact: true }).click();
    const add = page.getByRole("button", { name: /^Add \d+ ticked to / });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAccessibleDescription(
      "Tick one or more accommodations in the list to turn this on.",
    );
    const ticks = page.getByRole("checkbox", { name: /^Tick to add with others/ });
    await ticks.nth(0).check();
    await ticks.nth(1).check();
    await expect(add).toHaveAccessibleDescription("Choose a student to turn this on.");
    await page
      .getByLabel("Student for the ticked accommodations")
      .selectOption({ label: "Sample Learner" });
    await expect(add).toHaveText("Add 2 ticked to Sample Learner");
    await add.click();
    await expect(page.getByText("Sample Learner: added 2 accommodations.")).toBeVisible();
    await expect(ticks.nth(0)).not.toBeChecked();

    await ticks.nth(0).check();
    await ticks.nth(2).check();
    // A tick that a search hides is not counted or added.
    await page.getByRole("searchbox", { name: "Search the library" }).fill("zzzz-no-match");
    await expect(add).toHaveText("Add 0 ticked to Sample Learner");
    await page.getByRole("searchbox", { name: "Search the library" }).fill("");
    await expect(add).toHaveText("Add 2 ticked to Sample Learner");
    await add.click();
    await expect(
      page.getByText(/Sample Learner: added 1 accommodation\. Left out 1/),
    ).toBeVisible();

    await page.evaluate((h) => {
      window.location.hash = h;
    }, `#/student/${id}/accommodations`);
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test("My items are saved to a file and loaded back, and a wrong file is refused", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Libraries" }).click();
    await page.getByRole("button", { name: "Accommodations", exact: true }).click();
    const save = page.getByRole("button", { name: "Save My items to a file" });
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleDescription(/^Nothing in My items yet/);

    await page
      .getByRole("list", { name: "Accommodations" })
      .locator("li.lib-item > button")
      .nth(1)
      .click();
    const detail = page.locator("section.lib-detail");
    await detail.getByLabel("Frequency").fill("Every timed test");
    await detail.getByRole("button", { name: "Save to My items" }).click();
    await expect(save).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
    expect(download.suggestedFilename()).toBe("my-items.json");
    const text = await (
      await import("node:fs/promises")
    ).readFile((await download.path())!, "utf8");
    expect(JSON.parse(text).accommodations[0].frequency).toBe("Every timed test");

    const load = page.getByLabel("Load My items from a file");
    await load.setInputFiles({
      name: "x.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
    await expect(page.getByText("That is not a My items file.")).toBeVisible();
    await load.setInputFiles({
      name: "my-items.json",
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
    await expect(page.getByText(/^Nothing was added\. Left out 1/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
