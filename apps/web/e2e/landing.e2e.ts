import { expect, test } from "@playwright/test";
import { NOT_AFFILIATED, SLOGAN, header, tabBar, watchErrors } from "./helpers.ts";

test.describe("landing page, picker and tour", () => {
  test("the landing page shows the name, slogan, not-affiliated line and the practice notice", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "GoalLine", level: 2 })).toBeVisible();
    await expect(page.getByText(SLOGAN, { exact: true })).toBeVisible();
    await expect(page.getByText(NOT_AFFILIATED, { exact: true })).toBeVisible();
    await expect(page.getByText("Practice data only. Not for real students.")).toBeVisible();
    await expect(
      page.getByText("Everything in this app is made up. No real student information."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    // Signed out: no tab bar, no sign-out button, no data tag.
    await expect(tabBar(page)).toBeHidden();
    await expect(header(page).getByRole("button", { name: "Sign out" })).toHaveCount(0);
    await expect(page.locator(".watermark")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the slogan is followed by the not-affiliated line", async ({ page }) => {
    await page.goto("/");
    const order = await page.locator("main").evaluate((m) => {
      const text = m.textContent ?? "";
      return [text.indexOf("Made by SPED staff"), text.indexOf("Not affiliated")];
    });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[1]).toBeGreaterThan(order[0] ?? 0);
  });

  test("the picker lists the director and the four other practice people, and Back returns", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Practice: sign in as a sample user" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue as the director" })).toBeVisible();
    for (const person of [
      "Practice Case Manager",
      "Practice SLP",
      "Practice Para",
      "Practice Teacher",
    ])
      await expect(page.getByRole("button", { name: new RegExp(person) })).toBeVisible();
    await expect(page.locator("ul.pick > li")).toHaveCount(4);
    await expect(page.getByText(/never enter real students/)).toBeVisible();
    await expect(page.locator(".watermark")).toHaveCount(0);
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("heading", { name: "GoalLine", level: 2 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("See how it works opens the tour, which has the slogan, the line and no data tag", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    const link = page.getByRole("link", { name: "See how it works" });
    await expect(link).toHaveAttribute("href", "tour/");
    await link.click();
    await expect(page).toHaveURL(/\/tour\/$/);
    await expect(page.getByRole("heading", { name: "GoalLine", level: 1 })).toBeVisible();
    await expect(page.getByText(SLOGAN, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(NOT_AFFILIATED, { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Preview with practice data. Not for real students.").first(),
    ).toBeVisible();
    await expect(page.locator(".watermark")).toHaveCount(0);
    // The tour is a plain page: no script-made content is needed for the lines above.
    expect(errors).toEqual([]);
  });

  test("Back on the tour returns to the landing page", async ({ page }) => {
    await page.goto("/tour/");
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });

  test("the page asks the browser to stay inside the policy: no inline script, no outside request", async ({
    page,
  }) => {
    const outside: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("http://127.0.0.1")) outside.push(r.url());
    });
    const errors = watchErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Continue as the director" }).click();
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});
