import { expect, test } from "@playwright/test";
import { signIn, watchErrors } from "./helpers.ts";

// Late on Oct 30 in the school's own time zone it is already Oct 31 in UTC. Every screen that counts
// from "today" must use the school-local day: the screens below agree with each other and with the
// clock on the wall. (Screens that still use the UTC day are listed in the findings note.)
const CASES = [
  {
    zone: "America/Chicago",
    label: "Central",
    instant: "2026-10-31T04:30:00Z",
    local: "2026-10-30",
  },
  {
    zone: "America/Los_Angeles",
    label: "Pacific",
    instant: "2026-10-31T06:30:00Z",
    local: "2026-10-30",
  },
  {
    zone: "America/Chicago",
    label: "Central, midday",
    instant: "2026-10-30T17:00:00Z",
    local: "2026-10-30",
  },
];

for (const c of CASES) {
  test.describe(`${c.label} at ${c.instant}`, () => {
    test.use({ timezoneId: c.zone });

    test("What's due and the overdue list count from the local day", async ({ page }) => {
      const errors = watchErrors(page);
      await page.clock.setFixedTime(new Date(c.instant));
      await signIn(page, "director");
      await page.goto("/#/due");
      await expect(page.getByRole("heading", { level: 2, name: "What's due" })).toBeVisible();
      await expect(page.getByLabel("Practice date")).toHaveValue(c.local);
      await page.goto("/#/overdue");
      await expect(page.getByLabel("Practice date")).toHaveValue(c.local);
      expect(errors).toEqual([]);
    });
  });
}
