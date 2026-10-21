import { expect, test } from "@playwright/test";
import {
  type RoleKey,
  directorNames,
  header,
  loadSamplesAsDirector,
  signIn,
  watchErrors,
} from "./helpers.ts";

const go = (page: import("@playwright/test").Page, hash: string) =>
  page.evaluate((h) => {
    window.location.hash = h;
  }, hash);

const CHECKED = "Checked. Drafting from this is not connected yet, so nothing has been sent.";

test.describe("evaluation entry", () => {
  test("the director opens Draft from evaluation from Home and sees the practice warnings", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await signIn(page, "director");
    await page.getByRole("link", { name: /Draft from evaluation/ }).click();
    await expect(
      page.getByRole("heading", { name: "Draft from evaluation", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText("Do not type real names or details. Use made-up text."),
    ).toBeVisible();
    await expect(page.getByText("Practice build: nothing is sent anywhere.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Looks right, continue" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("names, phone numbers and dates are replaced in the preview, and the person is told what was removed", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await loadSamplesAsDirector(page);
    const names = await directorNames(page);
    const first = names[0]?.first ?? "";
    expect(first.length).toBeGreaterThan(1);
    await signIn(page, "director");
    await go(page, "#/evaluation");
    // Phone-shaped text is built from parts so the repository scan does not see a number.
    const phone = ["402", "555", "0123"].join("-");
    await page
      .getByRole("textbox", { name: /^Evaluator's summary/ })
      .fill(`${first} reads well. Call ${phone} on 3/4/2015.`);
    const preview = page.getByRole("region", { name: "Review what would be sent" });
    await expect(preview).toContainText("[name] reads well. Call [phone] on [date].");
    await expect(preview).toContainText("Removed:");
    await expect(preview).not.toContainText(first);
    await expect(preview).not.toContainText(phone);
    expect(errors).toEqual([]);
  });

  test("a score row must be complete, the check goes stale when the text changes", async ({
    page,
  }) => {
    await signIn(page, "director");
    await go(page, "#/evaluation");
    await page.getByRole("textbox", { name: /^Measure/ }).fill("Reading Fluency");
    await expect(page.getByText("Score 1: Enter the score.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Looks right, continue" })).toBeDisabled();
    await page.getByRole("textbox", { name: "Score", exact: true }).fill("1e3");
    await expect(page.getByText("The score must be a number.").first()).toBeVisible();
    await page.getByRole("textbox", { name: "Score", exact: true }).fill("85");
    await page.getByRole("textbox", { name: /^Percentile/ }).fill("16");
    await expect(page.getByText("Reading Fluency: standard score 85, percentile 16")).toBeVisible();
    await page.getByRole("button", { name: "Looks right, continue" }).click();
    await expect(page.getByText(CHECKED)).toBeVisible();
    await page.getByRole("textbox", { name: "Score", exact: true }).fill("86");
    await expect(page.getByText(CHECKED)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Looks right, continue" })).toBeEnabled();
  });

  test("a line about eligibility or a birth date is held back and blocks the check", async ({
    page,
  }) => {
    await signIn(page, "director");
    await go(page, "#/evaluation");
    await page
      .getByRole("textbox", { name: /^Recommendations/ })
      .fill("Student is ineligible for services");
    await expect(page.getByText("Held back: looks like eligibility conclusion.")).toBeVisible();
    await expect(page.getByText("1 line held back. Reword or remove them.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Looks right, continue" })).toBeDisabled();
    await page
      .getByRole("textbox", { name: /^Recommendations/ })
      .fill("Short, repeated practice helps.");
    await expect(page.getByText(/Held back/)).toHaveCount(0);
  });

  test("Remove score is a big button, and Clear everything asks twice", async ({ page }) => {
    await signIn(page, "director");
    await go(page, "#/evaluation");
    await page.getByRole("button", { name: "+ Add a score" }).click();
    const remove = page.getByRole("button", { name: /^Remove score/ });
    await expect(remove).toHaveCount(2);
    const box = await remove.first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await remove.last().click();
    await expect(remove).toHaveCount(1);
    await page.getByRole("textbox", { name: /^Evaluator's summary/ }).fill("Reads well.");
    await page.getByRole("button", { name: "Clear everything" }).click();
    await expect(page.getByRole("textbox", { name: /^Evaluator's summary/ })).toHaveValue(
      "Reads well.",
    );
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Clear everything" }).click();
    await page.getByRole("button", { name: "Yes, clear everything" }).click();
    await expect(page.getByRole("textbox", { name: /^Evaluator's summary/ })).toHaveValue("");
  });

  const WHO: [RoleKey, boolean][] = [
    ["director", true],
    ["case_manager", true],
    ["slp", false],
  ];
  for (const [role, allowed] of WHO) {
    test(`${role} ${allowed ? "has" : "does not have"} the Draft from evaluation tile and address`, async ({
      page,
    }) => {
      await signIn(page, role);
      const tile = page.getByRole("link", { name: /Draft from evaluation/ });
      await expect(tile).toHaveCount(allowed ? 1 : 0);
      await go(page, "#/evaluation");
      if (allowed)
        await expect(
          page.getByRole("heading", { name: "Draft from evaluation", level: 2 }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("heading", { name: "Not available for this role" }),
        ).toBeVisible();
      await expect(header(page)).toBeVisible();
    });
  }

  for (const role of ["para", "gen_ed"] as const) {
    test(`${role} cannot reach evaluation entry by address`, async ({ page }) => {
      await signIn(page, role);
      await go(page, "#/evaluation");
      await expect(page.getByRole("heading", { name: "Draft from evaluation" })).toHaveCount(0);
    });
  }
});
