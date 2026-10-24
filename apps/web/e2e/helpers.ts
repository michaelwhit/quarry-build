import { expect, type Page } from "@playwright/test";

export type RoleKey = "director" | "case_manager" | "slp" | "para" | "gen_ed";

export const PEOPLE: Record<RoleKey, { person: string; label: string }> = {
  director: { person: "Practice Director", label: "SPED director" },
  case_manager: { person: "Practice Case Manager", label: "Case manager" },
  slp: { person: "Practice SLP", label: "Related-service provider" },
  para: { person: "Practice Para", label: "Paraprofessional" },
  gen_ed: { person: "Practice Teacher", label: "General-education teacher" },
};

export const isDelegate = (r: RoleKey) => r === "para" || r === "gen_ed";

export const SLOGAN = "Made by SPED staff for SPED staff";
export const NOT_AFFILIATED = "Not affiliated with any school district or state agency.";

/** Console errors and uncaught exceptions during a test (a CSP violation is a console error). */
export function watchErrors(page: Page): string[] {
  const seen: string[] = [];
  page.on("pageerror", (e) => seen.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") seen.push(`console: ${m.text()}`);
  });
  // A request the browser cancels because the test moved to another page is not a failure.
  page.on("requestfailed", (r) => {
    if (r.failure()?.errorText === "net::ERR_ABORTED") return;
    seen.push(`request failed: ${r.url()}`);
  });
  return seen;
}

export const header = (page: Page) => page.locator("header.top");
export const tabBar = (page: Page) => page.getByRole("navigation", { name: "Main" });

/** Landing page, then the picker, then one practice person, past the notices. */
export async function signIn(page: Page, role: RoleKey) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (role === "director") {
    await page.getByRole("button", { name: "Continue as the director" }).click();
  } else {
    await page.getByRole("button", { name: new RegExp(PEOPLE[role].person) }).click();
  }
  await page.getByRole("button", { name: "I understand" }).click();
  if (isDelegate(role)) {
    await page.getByLabel("I have read this and I agree.").check();
    await page.getByRole("button", { name: "I agree, continue" }).click();
  }
  await expect(header(page)).toContainText(PEOPLE[role].person);
}

export async function signOut(page: Page) {
  await header(page).getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "GoalLine", level: 2 })).toBeVisible();
}

/** The director loads the 12 made-up sample students (some goals shared, some students served), then signs out. */
export async function loadSamplesAsDirector(page: Page) {
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "More" }).click();
  await page.getByRole("button", { name: "Load sample students" }).click();
  await expect(page.getByText(/12 students/)).toBeVisible();
  await signOut(page);
}

export async function noHorizontalScroll(page: Page) {
  const wider = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(wider, "page scrolls sideways").toBeLessThanOrEqual(0);
}

/** Each student's full name as the director's caseload shows it, to check what other roles do not see. */
export async function directorNames(page: Page): Promise<{ first: string; last: string }[]> {
  await signIn(page, "director");
  await tabBar(page).getByRole("link", { name: "Caseload" }).click();
  await expect(page.locator("ul.cards .name").first()).toBeVisible();
  const names = await page.locator("ul.cards .name").allInnerTexts();
  await signOut(page);
  return names.map((n) => {
    const parts = n.trim().split(/\s+/);
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
  });
}

const escapeRegExp = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Last names must appear nowhere on the page. */
export async function expectNoLastNames(page: Page, names: { last: string }[]) {
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const { last } of names) {
    if (last.length < 3) continue;
    expect(text, `last name "${last}" is on the page`).not.toMatch(
      new RegExp(`\\b${escapeRegExp(last.toLowerCase())}\\b`),
    );
  }
}

/** Records a simple session on the open Track screen, whatever the goal measures. Returns false for timers. */
export async function recordSimpleSession(page: Page): Promise<boolean> {
  const pad = page.getByRole("region", { name: "Record data" });
  const options = [
    pad.getByRole("button", { name: /Correct/ }),
    pad.getByRole("button", { name: "+ 1" }),
    pad.getByRole("button", { name: "Yes", exact: true }),
    pad.getByRole("radio").first(),
    pad.getByRole("checkbox").first(),
  ];
  for (const o of options) {
    if ((await o.count()) > 0) {
      await o.first().click();
      await pad.getByRole("button", { name: /Save session/ }).click();
      // A value far from the recent ones is asked about once; confirm it.
      const sure = pad.getByRole("button", { name: "Yes, save it" });
      if ((await sure.count()) > 0) await sure.click();
      return true;
    }
  }
  return false;
}
