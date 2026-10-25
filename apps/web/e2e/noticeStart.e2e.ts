import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers.ts";

// The "Practice data" notice that opens after sign-in: keyboard focus starts on its one button,
// Escape and a click outside do not dismiss it by accident, and the button closes it.
test.describe("practice data notice", () => {
  test("focus starts on I understand, and Escape and a click outside leave it open", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Continue as the director" }).click();
    const dialog = page.getByRole("dialog", { name: "Practice data, no real students" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "I understand" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "I understand" }).click();
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
