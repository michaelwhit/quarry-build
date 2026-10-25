import { expect, test, type Page } from "@playwright/test";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// The goal and accommodation libraries: stars are kept across a reload, Favorites only narrows to
// them, the grade band and area filters combine, and an empty result says what to do next.
async function openLibraries(page: Page) {
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "Libraries" }).click();
  await expect(page.getByRole("heading", { name: "Libraries" })).toBeVisible();
}

const count = async (page: Page, what: "goals" | "accommodations") => {
  const text = await page.locator("p.lib-count").innerText();
  const m = new RegExp(`(\\d+) of (\\d+) ${what}`).exec(text);
  expect(m, text).not.toBeNull();
  return { shown: Number(m![1]), all: Number(m![2]) };
};

const titles = (page: Page, list: "Goals" | "Accommodations") =>
  page.getByRole("list", { name: list }).locator("li.lib-item strong").allInnerTexts();

test.describe("libraries", () => {
  test("stars survive a reload and Favorites only shows just them", async ({ page }) => {
    const errors = watchErrors(page);
    await openLibraries(page);
    const goals = page.getByRole("list", { name: "Goals" });
    const stars = goals.getByRole("button", { name: /^Favorite: / });
    const all = await titles(page, "Goals");
    const picked = [all[0]!, all[2]!];
    for (const t of picked) await goals.getByRole("button", { name: `Favorite: ${t}` }).click();
    await expect(page.locator("p.lib-note")).toHaveText(`Saved "${picked[1]}" to your favorites.`);
    await expect(page.getByLabel("Favorites only (2)")).toBeVisible();

    await page.reload();
    await openLibraries(page);
    await expect(stars.filter({ hasText: "★" })).toHaveCount(2);
    await page.getByLabel("Favorites only (2)").check();
    expect((await titles(page, "Goals")).sort()).toEqual([...picked].sort());
    expect((await count(page, "goals")).shown).toBe(2);

    // Taking a star off while the filter is on leaves one, and the last one leaves the hint.
    await goals.getByRole("button", { name: `Favorite: ${picked[0]}` }).click();
    await expect(goals.getByRole("listitem")).toHaveCount(1);
    await goals.getByRole("button", { name: `Favorite: ${picked[1]}` }).click();
    await expect(goals.getByText("No favorites yet. Tap a star to save a goal.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a grade band and an area narrow together, and a search with no match can be cleared", async ({
    page,
  }) => {
    await openLibraries(page);
    const { all } = await count(page, "goals");
    expect(all).toBeGreaterThan(5);

    await page.getByLabel("Goal area").selectOption({ label: "Reading" });
    const byArea = (await count(page, "goals")).shown;
    expect(byArea).toBeGreaterThan(0);
    expect(byArea).toBeLessThan(all);

    const bands = await page.getByLabel("Grade band").locator("option").allInnerTexts();
    let narrowed = byArea;
    for (const band of bands.filter((b) => b !== "All grades")) {
      await page.getByLabel("Grade band").selectOption({ label: band });
      const both = (await count(page, "goals")).shown;
      expect(both, band).toBeLessThanOrEqual(byArea);
      narrowed = Math.min(narrowed, both);
    }
    expect(narrowed).toBeLessThan(byArea);
    expect(await titles(page, "Goals")).toHaveLength((await count(page, "goals")).shown);

    await page.getByLabel("Search the library").fill("zzzzqqqq");
    await expect(page.getByText("No goals match.")).toBeVisible();
    expect((await count(page, "goals")).shown).toBe(0);
    await page.getByRole("button", { name: "Clear search and filters" }).click();
    await expect(page.getByText("No goals match.")).toHaveCount(0);
    expect((await count(page, "goals")).shown).toBe(all);
    await expect(page.getByLabel("Goal area")).toHaveValue("");
    await expect(page.getByLabel("Grade band")).toHaveValue("");
  });

  test("an accommodation star is kept on its own list", async ({ page }) => {
    await openLibraries(page);
    await page.getByRole("button", { name: "Accommodations", exact: true }).click();
    const list = page.getByRole("list", { name: "Accommodations" });
    const first = (await titles(page, "Accommodations"))[0]!;
    await list.getByRole("button", { name: `Favorite: ${first}` }).click();
    await expect(page.getByLabel("Favorites only (1)")).toBeVisible();
    await page.getByRole("button", { name: "Goals", exact: true }).click();
    await expect(page.getByLabel("Favorites only (0)")).toBeVisible();
    await page.getByLabel("Favorites only (0)").check();
    await expect(page.getByText("No favorites yet. Tap a star to save a goal.")).toBeVisible();
  });
});
