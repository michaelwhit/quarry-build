import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// The director saves the practice data to a file, clears it, and loads it back. When something is
// already here the page asks whether to add the file's students or replace everything.
const practice = (page: Page) => page.getByRole("heading", { name: "Practice data" }).locator("..");
const status = (page: Page) => page.locator("p.saved[role=status]");

async function openMore(page: Page) {
  await tabBar(page).getByRole("link", { name: "More" }).click();
}

const send = (page: Page, name: string, text: string) =>
  page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });

test.describe("save practice data to a file and load it back", () => {
  test("save, clear, load, then add skips what is here and replace swaps it", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await openMore(page);
    await page.getByRole("button", { name: "Load sample students" }).click();
    await expect(practice(page)).toContainText("12 students");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save practice data to a file" }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toMatch(/^goalline-practice-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await saved.path();
    const text = readFileSync(path, "utf8");
    expect(JSON.parse(text).synthetic).toBe(true);

    await page.getByRole("button", { name: "Clear practice data" }).click();
    await page.getByRole("button", { name: "Yes, clear practice data" }).click();
    await page.waitForLoadState("load");
    await signIn(page, "director");
    await openMore(page);
    await expect(practice(page)).toContainText("0 students");
    await expect(page.getByRole("button", { name: "Save practice data to a file" })).toBeDisabled();

    // Nothing is here, so the file loads without asking.
    await send(page, "saved.json", text);
    await expect(status(page)).toHaveText("Loaded 12 students.");
    await expect(practice(page)).toContainText("12 students");

    // Something is here now: the page asks, and Cancel changes nothing.
    await send(page, "saved.json", text);
    await expect(
      page.getByRole("button", { name: "Replace everything with the file" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("button", { name: "Replace everything with the file" }),
    ).toHaveCount(0);
    await expect(practice(page)).toContainText("12 students");

    // Add leaves the 12 as they are and says so.
    await send(page, "saved.json", text);
    await page.getByRole("button", { name: "Add the file's students to what is here" }).click();
    await expect(status(page)).toHaveText(
      "Added 0 students; 12 already here and left as they are.",
    );
    await expect(practice(page)).toContainText("12 students");

    // Replace brings back the file's data after our own extra student.
    await page.evaluate(() => {
      window.location.hash = "#/add-student";
    });
    await page.getByLabel("First name").fill("Extra");
    await page.getByLabel("Last name").fill("Student");
    await page.getByRole("button", { name: "Add student" }).click();
    await openMore(page);
    await expect(practice(page)).toContainText("13 students");
    await send(page, "saved.json", text);
    await page.getByRole("button", { name: "Replace everything with the file" }).click();
    await expect(status(page)).toHaveText("Loaded 12 students.");
    await expect(practice(page)).toContainText("12 students");
    expect(errors).toEqual([]);
  });

  test("a file that is not a practice-data export is refused in plain words", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await openMore(page);
    await page.getByRole("button", { name: "Load sample students" }).click();
    await expect(practice(page)).toContainText("12 students");
    const refusal = "That file is not a practice-data export, or it has no students.";
    const bad: [string, string][] = [
      ["notes.json", "not json at all"],
      ["other.json", JSON.stringify({ app: "something-else", students: [{ id: "x" }] })],
      ["empty.json", JSON.stringify({ synthetic: true, students: [] })],
      ["hand-edited.json", JSON.stringify({ synthetic: true, students: [{ id: 7, name: {} }] })],
    ];
    for (const [name, body] of bad) {
      await send(page, name, body);
      // With data here the page asks first; the refusal comes after choosing.
      await page.getByRole("button", { name: "Replace everything with the file" }).click();
      await expect(status(page), name).toHaveText(refusal);
      await expect(practice(page), name).toContainText("12 students");
    }
    expect(errors).toEqual([]);
  });
});
