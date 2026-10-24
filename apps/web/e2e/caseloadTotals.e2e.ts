import { expect, test } from "@playwright/test";
import { loadSamplesAsDirector, signIn, tabBar } from "./helpers.ts";

test.describe("caseload summary", () => {
  test("the goal cards add up to the goal total, including goals with no data yet", async ({
    page,
  }) => {
    await loadSamplesAsDirector(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    const tiles = page.getByRole("list", { name: "Caseload summary" }).getByRole("listitem");
    const read = async (label: string) =>
      Number((await tiles.filter({ hasText: label }).locator(".n").innerText()).trim());
    const total = await read("IEP goals");
    const parts = [
      await read("Goals: needs attention"),
      await read("Goals: no data yet"),
      await read("Goals: on track"),
      await read("Goals: target met"),
    ];
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
  });
});
