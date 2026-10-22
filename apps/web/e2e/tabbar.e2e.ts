import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar } from "./helpers.ts";

// iPhone-sized screen. The bar must stay on the bottom edge while a long page scrolls, and the
// last thing on the page must be able to scroll clear of it.
test.describe("tab bar on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stays fixed on the bottom edge while a long page scrolls, and never hides the end", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.locator("ul.cards .name").first()).toBeVisible();

    const box = page.locator(".scroll");
    const metrics = await box.evaluate((el) => ({ all: el.scrollHeight, shown: el.clientHeight }));
    expect(metrics.all, "the page is long enough to scroll").toBeGreaterThan(metrics.shown * 1.5);

    // The window itself never scrolls, so nothing can drag the bar along.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
    ).toBe(true);

    const bar = tabBar(page);
    const rest = await bar.boundingBox();
    expect(rest).not.toBeNull();
    expect(Math.round((rest?.y ?? 0) + (rest?.height ?? 0))).toBe(844);

    for (const at of [0.3, 0.6, 1]) {
      await box.evaluate((el, f) => (el.scrollTop = (el.scrollHeight - el.clientHeight) * f), at);
      const now = await bar.boundingBox();
      expect(now?.y, `bar top at ${at} of the page`).toBeCloseTo(rest?.y ?? 0, 0);
      expect((now?.y ?? 0) + (now?.height ?? 0), `bar bottom at ${at}`).toBeCloseTo(844, 0);
    }

    // At the very end the footer is fully above the bar.
    const footer = await page.locator("footer").boundingBox();
    const end = await bar.boundingBox();
    expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBeLessThanOrEqual((end?.y ?? 0) + 1);
  });

  test("also holds at large text, where the bar grows taller", async ({ page }) => {
    await signIn(page, "director");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const bar = await tabBar(page).boundingBox();
    expect(Math.round((bar?.y ?? 0) + (bar?.height ?? 0))).toBe(844);
    await page.locator(".scroll").evaluate((el) => (el.scrollTop = el.scrollHeight));
    const after = await tabBar(page).boundingBox();
    expect(after?.y).toBeCloseTo(bar?.y ?? 0, 0);
  });
});
