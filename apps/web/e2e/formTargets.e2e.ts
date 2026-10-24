import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn } from "./helpers.ts";

// iPhone-sized screen. Typing fields, menus and date pickers on the forms and on What's due need
// a hit area at least 44 points high.
test.describe("form fields on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of ["#/due", "#/evaluation", "#/add-student", "#/staff"]) {
    test(`${route}: every field and menu is at least 44 points high`, async ({ page }) => {
      await loadSamplesAsDirector(page);
      await signIn(page, "director");
      await page.evaluate((h) => {
        window.location.hash = h;
      }, route);
      await expect(page.locator("main h2, h2.page-title").first()).toBeVisible();
      const small = await page.evaluate(() => {
        const found: string[] = [];
        for (const el of document.querySelectorAll(
          "main input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), main select, main textarea",
        )) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < 43.5) found.push(`${el.tagName} ${Math.round(r.height)}`);
        }
        return found;
      });
      expect(small).toEqual([]);
    });
  }
});
