import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { type RoleKey, signIn, tabBar, watchErrors } from "./helpers.ts";

const go = (page: import("@playwright/test").Page, hash: string) =>
  page.evaluate((h) => {
    window.location.hash = h;
  }, hash);

test.describe("staff and roles, and the access review", () => {
  test("the director opens Staff and roles from Home and sees every made-up staff member", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await page.getByRole("link", { name: /Staff and roles/ }).click();
    await expect(page.getByRole("heading", { name: "Staff and roles", level: 2 })).toBeVisible();
    await expect(page.getByText(/read only/)).toBeVisible();
    const cards = page.getByRole("list", { name: "Staff" }).getByRole("listitem");
    await expect(cards).toHaveCount(6);
    await expect(cards.first()).toContainText("SPED director");
    await expect(cards.first()).toContainText("District office");
    await expect(cards.first()).toContainText("Status: Active");
    expect(errors).toEqual([]);
  });

  test("role chips and search narrow the list", async ({ page }) => {
    await signIn(page, "director");
    await go(page, "#/staff");
    const cards = page.getByRole("list", { name: "Staff" }).getByRole("listitem");
    await page.getByRole("button", { name: "Paras" }).click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Paras" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Case managers" }).click();
    await expect(cards).toHaveCount(2);
    await page.getByRole("button", { name: "All" }).click();
    await page.getByRole("searchbox", { name: "Search staff" }).fill("zzzz");
    await expect(page.getByText("No staff match.")).toBeVisible();
    await page.getByRole("searchbox", { name: "Search staff" }).fill("");
    await expect(cards).toHaveCount(6);
  });

  test("the access review lists who can see records and saves a quoted CSV", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await page.getByRole("link", { name: /Access review/ }).click();
    await expect(
      page.getByRole("heading", { name: "Who can see student records", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText("Keep this list current. It shows who may see student records."),
    ).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save as CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("who-can-see-student-records.csv");
    const path = await download.path();
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
    expect(lines[0]).toBe("Name,Position,Role");
    expect(lines).toHaveLength(7);
    for (const line of lines.slice(1)) expect(line).toMatch(/^"[^"]+","[^"]+","[^"]+"$/);
    expect(errors).toEqual([]);
  });

  const OTHERS: RoleKey[] = ["case_manager", "slp", "para", "gen_ed"];
  for (const role of OTHERS) {
    test(`${role} has no staff tiles and cannot open the staff pages by address`, async ({
      page,
    }) => {
      await signIn(page, role);
      await expect(page.getByRole("link", { name: /Staff and roles|Access review/ })).toHaveCount(
        0,
      );
      for (const hash of ["#/staff", "#/access-review"]) {
        await go(page, hash);
        await expect(page.getByRole("heading", { name: "Staff and roles", level: 2 })).toHaveCount(
          0,
        );
        await expect(
          page.getByRole("heading", { name: "Who can see student records", level: 2 }),
        ).toHaveCount(0);
      }
      if (role === "case_manager" || role === "slp")
        await expect(
          page.getByRole("heading", { name: "Not available for this role" }),
        ).toBeVisible();
      await expect(tabBar(page)).toBeVisible();
    });
  }
});
