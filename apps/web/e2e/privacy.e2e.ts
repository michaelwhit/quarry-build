import { expect, test } from "@playwright/test";
import { PEOPLE, watchErrors } from "./helpers.ts";

test.describe("student privacy page", () => {
  for (const role of ["para", "gen_ed"] as const) {
    test(`${PEOPLE[role].label}: five points, Continue waits for the checkbox`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await page.goto("/");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(PEOPLE[role].person) }).click();
      await page.getByRole("button", { name: "I understand" }).click();
      await expect(page.getByRole("heading", { name: "Student privacy" })).toBeVisible();
      await expect(
        page.getByText("Proposed wording. Not final until the district approves it."),
      ).toBeVisible();
      await expect(page.locator(".privacy-points li")).toHaveCount(5);
      const next = page.getByRole("button", { name: "I agree, continue" });
      await expect(next).toBeDisabled();
      const box = page.getByLabel("I have read this and I agree.");
      await box.check();
      await expect(next).toBeEnabled();
      await box.uncheck();
      await expect(next).toBeDisabled();
      await box.check();
      await next.click();
      await expect(page.locator("header.top")).toContainText(PEOPLE[role].person);
      await expect(page.getByRole("heading", { name: "Student privacy" })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});
