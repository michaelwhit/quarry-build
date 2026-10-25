import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

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

  test("Skip to content is the first stop in the keyboard order and jumps past the tab bar", async ({
    page,
  }) => {
    await signIn(page, "director");
    const first = await page.evaluate(() => {
      const stops = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select")];
      const bar = document.querySelector("nav a");
      return {
        firstIsSkip: stops[0]?.classList.contains("skip") ?? false,
        skipBeforeBar: bar ? stops.indexOf(bar as HTMLElement) > 0 : false,
      };
    });
    expect(first).toEqual({ firstIsSkip: true, skipBeforeBar: true });
    const skip = page.getByRole("link", { name: "Skip to content" });
    await skip.focus();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeInViewport();
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
    // On a phone the content scrolls inside the page's scroll box, not the window.
    await page.evaluate(() => {
      const box = document.querySelector(".scroll");
      if (box) box.scrollTop = box.scrollHeight;
    });
    const footer = await page.locator("footer").boundingBox();
    const bar = await tabBar(page).boundingBox();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    // At phone width the bar sits along the bottom; the sidebar layout starts at 800px.
    expect(footer && bar && footer.y + footer.height <= bar.y + 1).toBe(true);
  });
});

test.describe("desktop widths", () => {
  for (const width of [1280, 1440]) {
    test(`no sideways scroll on any tab at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, "director");
      for (const name of ["Home", "Today", "Caseload", "Libraries", "More"]) {
        const link = tabBar(page).getByRole("link", { name });
        await link.click();
        // Measure the screen that was just opened, not the previous one.
        await expect(link).toHaveAttribute("aria-current", "page");
        await expect(
          page.getByRole("main").getByRole("heading", { level: 2 }).first(),
        ).toBeVisible();
        await expect
          .poll(
            () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            { message: name },
          )
          .toBe(true);
      }
    });
  }
});

test.describe("present levels screen", () => {
  test("focus, names and announcements work from the keyboard", async ({ page }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await page.locator('a[href^="#/student/"]').first().click();
    await page
      .getByRole("link", { name: /Present levels/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 2, name: "Present levels" })).toBeVisible();

    // Opening a form puts focus inside it; closing it puts focus back on the evidence section.
    await page.getByRole("button", { name: "+ Add a need or strength" }).click();
    await expect(page.getByLabel("Kind")).toBeFocused();
    await page
      .getByLabel("In your words, one sentence (do not type real names or details)")
      .fill("Reads short sentences with help.");
    await page.getByRole("button", { name: "This matches the report" }).click();
    await expect(page.locator("#pl-evidence")).toBeFocused();

    // Each row's buttons say which row they act on, and removing says so aloud.
    const remove = page.getByRole("button", {
      name: "Remove need: Reads short sentences with help.",
    });
    await expect(remove).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit need: Reads short sentences with help." }),
    ).toBeVisible();
    await remove.click();
    await expect(page.getByRole("status").filter({ hasText: "Removed need" })).toHaveCount(1);
    await expect(page.locator("#pl-evidence")).toBeFocused();
    expect(errors).toEqual([]);
  });
});
