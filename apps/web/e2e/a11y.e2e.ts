import { expect, test } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

test.describe("keyboard and screen-reader basics", () => {
  test("moving to another tab puts focus on that screen's heading and names the page", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Today" }).click();
    const heading = page.getByRole("heading", { level: 2, name: "Today" });
    await expect(heading).toBeFocused();
    await expect(page).toHaveTitle("Today · GoalLine");
    expect(errors).toEqual([]);
  });

  test("the test-data notice is a landmark and the page has one main", async ({ page }) => {
    await signIn(page, "director");
    await expect(page.getByRole("complementary", { name: "Test data notice" })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
  });

  test("large text keeps the page from scrolling sideways and clear of the tab bar", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "phone", "the sidebar layout has no bottom bar");
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "director");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = await page.locator("footer").boundingBox();
    const bar = await tabBar(page).boundingBox();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    // At phone width the bar sits along the bottom; the sidebar layout starts at 800px.
    expect(footer && bar && footer.y + footer.height <= bar.y + 1).toBe(true);
  });
});
