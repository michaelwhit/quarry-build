import { expect, test } from "@playwright/test";

test.describe("tour on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("every link, button and menu on the tour is at least 44 points square", async ({ page }) => {
    await page.goto("/tour/");
    const small = await page.evaluate(() => {
      const found: string[] = [];
      for (const el of document.querySelectorAll("a, button, select")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 43.5 || r.height < 43.5)
          found.push(`${el.tagName} ${(el.textContent ?? "").trim().slice(0, 30)}`);
      }
      return found;
    });
    expect(small).toEqual([]);
  });
});
