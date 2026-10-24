import { expect, test } from "@playwright/test";
import { directorNames, loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

test.describe("general-education teacher", () => {
  test("My students lists only the students with a shared goal, with name and grade (by design) and no ids", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    const names = await directorNames(page);
    await signIn(page, "gen_ed");
    await tabBar(page).getByRole("link", { name: "My students" }).click();
    await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
    const rows = page.locator("ul.pick > li");
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(names.length);
    // Decision in the app: a gen-ed teacher sees the full name and grade, never ids or a birth date.
    await expect(page.locator("ul.pick > li strong").first()).toBeVisible();
    const shown = (await page.locator("ul.pick > li strong").allInnerTexts()).map((t) => t.trim());
    const known = names.map((x) => `${x.first} ${x.last}`.trim());
    for (const name of shown) expect(known, `${name} is not a sample student`).toContain(name);
    await expect(page.getByText(/Case ID|birth/i)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("At a glance is read only: whole goals, accommodations, services, nothing to record or edit", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "gen_ed");
    await tabBar(page).getByRole("link", { name: "My students" }).click();
    await page.locator("ul.pick > li a").first().click();
    await expect(page.getByText(/Read only\./)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Goals", level: 3 })).toBeVisible();
    expect(await page.locator("li.card p").count()).toBeGreaterThan(0);
    await expect(
      page.getByRole("heading", { name: "Accommodations and modifications" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
    await expect(page.getByText("Planned", { exact: true })).toHaveCount(0);
    for (const gone of [
      "Start a session",
      "Track this goal",
      "Edit goal",
      "Save session",
      "Add a goal",
    ])
      await expect(page.getByText(gone)).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
    await expect(page.getByText(/Case ID|birth/i)).toHaveCount(0);
    await page.getByRole("link", { name: "← My students" }).click();
    await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("cannot reach recording or other tabs by address: it shows My students", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "gen_ed");
    for (const hash of ["#/caseload", "#/track/x/y", "#/add-student", "#/import-students"]) {
      await page.evaluate((h) => (window.location.hash = h), hash);
      await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Start a session" })).toHaveCount(0);
      await expect(page.getByText("Import students")).toHaveCount(0);
    }
  });

  test("lands on My students right after sign-in", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "gen_ed");
    await expect(page.getByRole("heading", { name: "My students", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your goals today" })).toHaveCount(0);
  });

  test("a student address that is not shared shows the student is no longer shared", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "gen_ed");
    await page.evaluate(() => (window.location.hash = "#/glance/not-a-student"));
    await expect(page.getByText("This student is no longer shared with you.")).toBeVisible();
    await page.evaluate(() => (window.location.hash = "#/glance/%E0%A4%A"));
    await expect(page.getByText("Student not found")).toBeVisible();
  });
});
