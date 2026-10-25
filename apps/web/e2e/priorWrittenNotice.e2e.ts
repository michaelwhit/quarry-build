import { expect, test, type Page } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

// The Prior Written Notice draft: each box is approved by the teacher, a box with something
// missing shows why and cannot be approved, and changing any entry clears every approval.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const box = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const approve = (page: Page, name: string) =>
  box(page, name).getByRole("button", { name: "I read this and approve it" });
const approved = (page: Page, name: string) =>
  box(page, name).getByText("Approved. Changing any entry clears this.");

async function openNotice(page: Page) {
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  await page.locator("ul.cards .name").first().click();
  await page.getByRole("link", { name: "Prior Written Notice" }).click();
  await expect(page.getByRole("heading", { name: "Prior Written Notice draft" })).toBeVisible();
}

test.describe("Prior Written Notice draft", () => {
  test("approving a box shows Copy, and changing the date or a box's entry clears the approval", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await openNotice(page);
    const factors = "Other relevant factors";

    await approve(page, factors).click();
    await expect(approved(page, factors)).toBeVisible();
    await expect(approve(page, factors)).toHaveCount(0);
    const copy = box(page, factors).getByRole("button", { name: `Copy ${factors}` });
    await copy.click();
    await expect(box(page, factors).getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("None.");

    // Changing the date of the notice clears the approval and the Copy button with it.
    await page.getByLabel("Date of the notice").fill("2026-11-02");
    await expect(approve(page, factors)).toBeVisible();
    await expect(copy).toHaveCount(0);

    // Changing the box's own entry clears it too, and the new text is what gets approved.
    await approve(page, factors).click();
    await expect(approved(page, factors)).toBeVisible();
    await page
      .getByLabel("Other relevant factors (one per line, optional)")
      .fill("Parent asked for a morning meeting");
    await page.getByLabel("Date of the notice").focus();
    await expect(approve(page, factors)).toBeVisible();
    await expect(box(page, factors)).toContainText("Parent asked for a morning meeting");
    await approve(page, factors).click();
    await box(page, factors)
      .getByRole("button", { name: `Copy ${factors}` })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "Parent asked for a morning meeting",
    );
    expect(errors).toEqual([]);
  });

  test("the contact box says what is missing until a name and role are typed, then clears with an edit", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await openNotice(page);
    const contact = "Contact for questions";

    await expect(box(page, contact).getByRole("note")).toHaveText(
      "Add the case manager's name and role as the contact.",
    );
    await expect(approve(page, contact)).toHaveCount(0);

    const entries = page.getByRole("group", { name: contact });
    await entries.getByLabel("Name").fill("Sample Person");
    await expect(approve(page, contact)).toHaveCount(0);
    await entries.getByLabel("Role").fill("Case manager");
    await expect(box(page, contact).getByRole("note")).toHaveCount(0);
    await approve(page, contact).click();
    await expect(approved(page, contact)).toBeVisible();
    await expect(box(page, contact)).toContainText("Sample Person, Case manager");

    await entries.getByLabel("Role").fill("Special education teacher");
    await expect(approved(page, contact)).toHaveCount(0);
    await expect(approve(page, contact)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the notice shows the two dates in words as they are typed", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await openNotice(page);
    const notice = box(page, "The notice");
    await expect(notice).toContainText("Date of the notice: not entered");
    await page.getByLabel("Date of the notice").fill("2026-11-10");
    await page.getByLabel("Date it was given to the parent").fill("2026-11-02");
    await expect(notice).toContainText("Date of the notice: Nov 10, 2026");
    await expect(notice).toContainText("Date given: Nov 2, 2026");
  });

  test("a date that is missing or out of order says so in the notice", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await openNotice(page);
    const notes = box(page, "The notice").getByRole("note");
    await expect(notes).toHaveText(["Date of note is not a real date."]);
    await page.getByLabel("Date of the notice").fill("2026-11-10");
    await expect(notes).toHaveCount(0);
    await page.getByLabel("Date it was given to the parent").fill("2026-11-02");
    await expect(notes).toHaveText(["Date of delivery is before the date of note."]);
    await page.getByLabel("Date it was given to the parent").fill("2026-11-12");
    await expect(notes).toHaveCount(0);
  });
});
