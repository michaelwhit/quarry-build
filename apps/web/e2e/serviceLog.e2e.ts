import { expect, test, type Page } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar, watchErrors } from "./helpers.ts";

// The service minutes log on a student's page: the week line, make-up owed only for minutes the
// school missed, removing an entry, the plain-words problems, and the 400-entry cap.
const KEY = "goalline-practice-servicelog-v1";

async function openLog(page: Page): Promise<string> {
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  await page.locator("ul.cards .name").first().click();
  const id = await page.evaluate(() => /#\/student\/([^/]+)/.exec(window.location.hash)![1]!);
  await page.getByRole("link", { name: "Service minutes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Service minutes log" })).toBeVisible();
  return id;
}

async function add(page: Page, what: string, minutes: string) {
  await page.getByLabel("What happened").selectOption({ label: what });
  await page.getByLabel("Minutes", { exact: true }).fill(minutes);
  await page.getByRole("button", { name: "Add to log" }).click();
}

const weeks = (page: Page) => page.getByRole("region", { name: "Weeks" });
const entries = (page: Page) => page.getByRole("region", { name: "Entries" });

test.describe("service minutes log", () => {
  test("make-up is owed only for minutes the provider missed, and removing an entry updates it", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    await openLog(page);
    await expect(weeks(page)).toContainText("No entries yet.");
    await page.getByLabel("Minutes the IEP calls for each week").fill("90");

    await add(page, "Student absent", "30");
    await expect(weeks(page)).toContainText(
      "Delivered 0 of 90 minutes; 90 short, none owed in make-up.",
    );

    await add(page, "Provider absent", "30");
    await expect(weeks(page)).toContainText(
      "Delivered 0 of 90 minutes; 90 short, 30 owed in make-up.",
    );

    await add(page, "Session held", "60");
    await expect(weeks(page)).toContainText(
      "Delivered 60 of 90 minutes; 30 short, 30 owed in make-up.",
    );
    await expect(entries(page).getByRole("listitem")).toHaveCount(3);

    await entries(page)
      .getByRole("listitem")
      .filter({ hasText: "Provider absent" })
      .getByRole("button", { name: /^Remove .* entry$/ })
      .click();
    await expect(entries(page).getByRole("listitem")).toHaveCount(2);
    await expect(weeks(page)).toContainText(
      "Delivered 60 of 90 minutes; 30 short, none owed in make-up.",
    );

    await add(page, "Session held", "30");
    await expect(weeks(page)).toContainText("Delivered 90 of 90 minutes.");
    expect(errors).toEqual([]);
  });

  test("a bad number is refused in plain words and nothing is added", async ({ page }) => {
    await loadSamplesAsDirector(page);
    await openLog(page);
    const problem = page.getByRole("status").filter({ hasText: /\S/ });
    await add(page, "Session held", "0");
    await expect(problem).toHaveText("Minutes must be a whole number, at least 1.");
    await add(page, "Session held", "481");
    await expect(problem).toHaveText("Minutes cannot be more than 480.");
    await expect(weeks(page)).toContainText("No entries yet.");
    await add(page, "Session held", "45");
    await expect(problem).toHaveCount(0);
    await expect(entries(page)).toContainText("45 min");
  });

  test("a log holds at most 400 entries", async ({ page }) => {
    await loadSamplesAsDirector(page);
    const id = await openLog(page);
    const seeded = await page.evaluate(
      ([key, sid]) => {
        const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
        const list = Array.from({ length: 400 }, (_, n) => ({
          id: `e${n + 1}`,
          date: day(n % 200),
          minutes: 10,
          outcome: "delivered",
        }));
        window.localStorage.setItem(
          key!,
          JSON.stringify({ [sid!]: { requiredPerWeek: 60, entries: list } }),
        );
        return list.length;
      },
      [KEY, id],
    );
    expect(seeded).toBe(400);
    // The log is read when the page loads, and reloading signs the person out.
    await page.reload();
    await signIn(page, "director");
    await page.evaluate((sid) => {
      window.location.hash = `#/student/${sid}/service-log`;
    }, id);
    await expect(entries(page).getByRole("listitem")).toHaveCount(400);
    await add(page, "Session held", "10");
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveText(
      "A log holds at most 400 entries.",
    );
    await expect(entries(page).getByRole("listitem")).toHaveCount(400);
    // Removing one makes room again.
    await entries(page)
      .getByRole("button", { name: /^Remove .* entry$/ })
      .first()
      .click();
    await add(page, "Session held", "10");
    await expect(entries(page).getByRole("listitem")).toHaveCount(400);
  });
});
