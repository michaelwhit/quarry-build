import { expect, test, type Page } from "@playwright/test";
import {
  loadSamplesAsDirector,
  recordSimpleSession,
  signIn,
  tabBar,
  watchErrors,
} from "./helpers.ts";

/** Every link, button and field that has no name a screen reader could read out. */
async function unnamed(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const named = (el: HTMLElement): boolean => {
      if (el.getAttribute("aria-label")?.trim()) return true;
      const by = el.getAttribute("aria-labelledby");
      if (by && by.split(/\s+/).some((id) => text(document.getElementById(id)))) return true;
      if (el.getAttribute("title")?.trim()) return true;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      )
        return [...(el.labels ?? [])].some((l) => text(l));
      if (el.querySelector("img[alt]:not([alt=''])")) return true;
      return text(el) !== "";
    };
    const visible = (el: HTMLElement) =>
      !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link]",
    ))
      if (visible(el) && !named(el))
        found.push(`${el.tagName.toLowerCase()} ${el.className}`.trim());
    return found;
  });
}

async function structure(page: Page, label: string) {
  expect(await unnamed(page), `${label}: controls with no name`).toEqual([]);
  expect(await page.locator("h1").count(), `${label}: h1 count`).toBe(1);
  await expect(page.getByRole("main"), `${label}: main`).toHaveCount(1);
  await expect(page.getByRole("banner"), `${label}: banner`).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Main" }), `${label}: tab bar`).toHaveCount(1);
  const landmarks = await page
    .locator("main, nav, header, [role=main], [role=navigation]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.tagName.toLowerCase()));
  expect(new Set(landmarks).size, `${label}: two landmarks share a name`).toBe(landmarks.length);
}

test.describe("screen reader basics", () => {
  test("every control has a name, and each page has one h1, one main and one tab bar", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await structure(page, "Home");
    for (const tab of ["Today", "Caseload"]) {
      await tabBar(page).getByRole("link", { name: tab }).click();
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
      await structure(page, tab);
    }
    await page.locator("ul.cards .name").first().click();
    await expect(page.getByRole("navigation", { name: "Student sections" })).toBeVisible();
    await structure(page, "Student page");
    await page.evaluate(() => {
      window.location.hash = "#/due";
    });
    await expect(page.getByRole("heading", { name: "What's due", level: 2 })).toBeVisible();
    await structure(page, "What's due");
    expect(errors).toEqual([]);
  });

  test("the current tab says so with aria-current, and only one tab does", async ({ page }) => {
    await signIn(page, "director");
    for (const tab of ["Home", "Today", "Caseload", "Libraries", "More"]) {
      await tabBar(page).getByRole("link", { name: tab }).click();
      await expect(tabBar(page).getByRole("link", { name: tab })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(tabBar(page).locator("[aria-current]")).toHaveCount(1);
    }
  });

  test("saving a session is announced in a status region", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator("ul.cards .name").first().click();
    await page
      .getByRole("link", { name: /^Track/ })
      .first()
      .click();
    await expect(page.getByRole("region", { name: "Record data" })).toBeVisible();
    // The status line exists before saving, so a screen reader is already watching it.
    await expect(page.locator("p.saved[role=status]")).toHaveCount(1);
    if (!(await recordSimpleSession(page))) test.skip(true, "the first goal is a timer");
    await expect(page.locator("p.saved[role=status]")).not.toHaveText("");
  });
});
