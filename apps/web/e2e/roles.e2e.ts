import { expect, test } from "@playwright/test";
import {
  PEOPLE,
  type RoleKey,
  header,
  loadSamplesAsDirector,
  noHorizontalScroll,
  signIn,
  signOut,
  tabBar,
  watchErrors,
} from "./helpers.ts";

const FULL_TABS = ["Home", "Today", "Caseload", "Libraries", "More"];
const TABS: Record<RoleKey, string[]> = {
  director: FULL_TABS,
  case_manager: FULL_TABS,
  slp: FULL_TABS,
  para: ["Today", "More"],
  gen_ed: ["My students", "More"],
};

test.describe("each role's tabs", () => {
  for (const role of Object.keys(TABS) as RoleKey[]) {
    test(`${PEOPLE[role].label} sees exactly its own tabs`, async ({ page }) => {
      const errors = watchErrors(page);
      await signIn(page, role);
      const links = tabBar(page).getByRole("link");
      await expect(links).toHaveCount(TABS[role].length);
      for (const name of TABS[role])
        await expect(tabBar(page).getByRole("link", { name })).toBeVisible();
      for (const gone of FULL_TABS.filter((t) => !TABS[role].includes(t)))
        await expect(tabBar(page).getByRole("link", { name: gone })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test("the director lands on Home and every one of its tabs opens a screen", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await expect(page.getByRole("heading", { name: "Home", level: 2 })).toBeVisible();
    for (const [tab, heading] of [
      ["Today", "Today"],
      ["Caseload", /Caseload/],
      ["Libraries", "Libraries"],
      ["More", "More"],
    ] as const) {
      await tabBar(page).getByRole("link", { name: tab }).click();
      await expect(page.getByRole("heading", { level: 2, name: heading }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("Libraries opens, and every Home tile the director sees is offered or marked Planned, never both", async ({
    page,
  }) => {
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Libraries" }).click();
    await expect(page.getByRole("heading", { name: "Libraries", level: 2 })).toBeVisible();
    await tabBar(page).getByRole("link", { name: "Home" }).click();
    // Present levels is built for the director, so its tile is a link to the caseload.
    await expect(page.getByRole("link", { name: /Present levels/ })).toHaveAttribute(
      "href",
      "#/caseload",
    );
    // A tile that is still Planned is a label, not a link or a button.
    const planned = page.locator('[aria-label$="Planned, not available yet."]');
    for (const tile of await planned.all()) {
      await expect(tile.getByRole("link")).toHaveCount(0);
    }
  });

  test("the privacy page comes first for paras and gen-ed teachers, and declining returns to the picker", async ({
    page,
  }) => {
    for (const role of ["para", "gen_ed"] as const) {
      await page.goto("/");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(PEOPLE[role].person) }).click();
      await page.getByRole("button", { name: "I understand" }).click();
      await expect(page.getByRole("heading", { name: "Student privacy" })).toBeVisible();
      await expect(page.getByText("Practice only · Proposed wording")).toBeVisible();
      await page.getByRole("button", { name: "I do not agree" }).click();
      await expect(page.getByRole("heading", { name: "GoalLine", level: 2 })).toBeVisible();
    }
  });

  test("the director, case manager and SLP go straight in with no privacy page", async ({
    page,
  }) => {
    for (const role of ["director", "case_manager", "slp"] as const) {
      await signIn(page, role);
      await expect(page.getByRole("heading", { name: "Student privacy" })).toHaveCount(0);
      await signOut(page);
    }
  });

  test("signing out returns to the landing page, and a reload forgets who was signed in", async ({
    page,
  }) => {
    await signIn(page, "case_manager");
    await signOut(page);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(tabBar(page)).toBeHidden();
    await signIn(page, "slp");
    await page.reload();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(header(page)).not.toContainText("Practice SLP");
  });

  test("the More tab has Sign out and Clear practice data for every role", async ({ page }) => {
    for (const role of Object.keys(TABS) as RoleKey[]) {
      await signIn(page, role);
      await tabBar(page).getByRole("link", { name: "More" }).click();
      await expect(page.getByRole("heading", { name: "More", level: 2 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Clear practice data" })).toBeVisible();
      await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    }
  });

  test("only the director can load sample students and save or load a practice file", async ({
    page,
  }) => {
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "More" }).click();
    await expect(page.getByRole("button", { name: "Load sample students" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save practice data to a file" })).toBeVisible();
    await signOut(page);
    for (const role of ["case_manager", "slp", "para", "gen_ed"] as const) {
      await signIn(page, role);
      await tabBar(page).getByRole("link", { name: "More" }).click();
      await expect(page.getByRole("button", { name: "Load sample students" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save practice data to a file" })).toHaveCount(
        0,
      );
      await expect(
        page.getByText("Loading and saving practice data is for the director role"),
      ).toBeVisible();
      await signOut(page);
    }
  });

  test("with sample students loaded, the SLP sees only the served students, the case manager everyone", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    const cards = page.locator("ul.cards > li");
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(cards).toHaveCount(12);
    await signOut(page);
    await signIn(page, "slp");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(cards.first()).toBeVisible();
    const served = await cards.count();
    expect(served).toBeGreaterThan(0);
    expect(served).toBeLessThan(12);
    await signOut(page);
    await signIn(page, "case_manager");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(cards).toHaveCount(12);
  });

  test("an empty practice start explains itself per role", async ({ page }) => {
    await signIn(page, "slp");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.getByText(/Ask the director to mark the students you serve/)).toBeVisible();
    await signOut(page);
    await signIn(page, "para");
    await expect(page.getByText("No goals are shared with you yet.")).toBeVisible();
  });

  test("every role's first screens fit the screen width with no sideways scroll", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    for (const role of Object.keys(TABS) as RoleKey[]) {
      await signIn(page, role);
      await noHorizontalScroll(page);
      for (const name of TABS[role]) {
        await tabBar(page).getByRole("link", { name }).click();
        await noHorizontalScroll(page);
      }
      await signOut(page);
    }
  });
});
