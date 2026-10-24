import { expect, test, type Page } from "@playwright/test";
import {
  fakeApi,
  openLanding,
  person,
  SIGNIN_URL,
  token,
  type Handler,
  type Reply,
} from "./fakeApi.ts";
import { header } from "./helpers.ts";

// In the build with a sign-in server, every way out of a session clears the kept practice text and
// reloads, so nothing from one person is there for the next. Server answers come from fakeApi.ts.
test.use({ baseURL: SIGNIN_URL });

const KEYS = [
  "goalline-practice-v1",
  "goalline-practice-services-v1",
  "goalline-practice-servicelog-v1",
  "goalline-practice-pwn-v1",
  "goalline-practice-plaafp-v1",
  "goalline-practice-srs-v1",
  "goalline-practice-reports-v1",
  "goalline-practice-goalextras-v1",
  "goalline-practice-placement-v1",
  "goalline-practice-transition-v1",
  "goalline-practice-considerations-v1",
  "goalline-practice-iepshort-v1",
  "goalline-practice-library-favorites-v1",
];

const signedInHandlers = (expiresInMs: number): Record<string, Handler> => ({
  "POST /v0/auth/web/refresh": { status: 401 },
  "POST /v0/auth/password": {
    body: {
      status: "signed_in",
      access_token: "test-access-token",
      access_expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    },
  },
  "GET /v0/me": { body: person("case_manager", "Sample Person") },
  "POST /v0/auth/web/logout": { status: 204 },
});

async function signInAndSeed(page: Page) {
  await openLanding(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Work email").fill("sample@example.test");
  await page.getByLabel(/^Password/).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(header(page).getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.evaluate((ks) => ks.forEach((k) => window.localStorage.setItem(k, "{}")), KEYS);
}

const leftover = (page: Page) =>
  page.evaluate((ks) => ks.filter((k) => window.localStorage.getItem(k) !== null), KEYS);

test.describe("sign-out clears kept practice text", () => {
  test("the Sign out button clears every key and reloads to the landing page", async ({ page }) => {
    await fakeApi(page, signedInHandlers(3_600_000));
    await signInAndSeed(page);
    await header(page).getByRole("button", { name: "Sign out" }).click();
    await page.waitForEvent("load");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    expect(await leftover(page)).toEqual([]);
  });

  test("an expired session (the refresh fails) clears every key and reloads too", async ({
    page,
  }) => {
    await page.clock.install();
    await fakeApi(page, signedInHandlers(70_000));
    await signInAndSeed(page);
    await page.clock.runFor(15_000);
    await page.waitForEvent("load");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    expect(await leftover(page)).toEqual([]);
  });

  test("the More screen says signing out clears it", async ({ page }) => {
    await fakeApi(page, signedInHandlers(3_600_000));
    await signInAndSeed(page);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "More" })
      .click();
    await expect(page.getByText(/Signing out clears it\./)).toBeVisible();
    await expect(page.getByText(/Signing out keeps it\./)).toHaveCount(0);
  });

  for (const failure of ["answers 500", "cannot be reached"]) {
    test(`if the server ${failure} at sign-out, a reload does not sign the person back in`, async ({
      page,
    }) => {
      let cookieValid = false;
      let logout: Reply = failure === "answers 500" ? { status: 500 } : { down: true };
      const calls = await fakeApi(page, {
        ...signedInHandlers(3_600_000),
        // A valid cookie is exactly what would sign the person back in.
        "POST /v0/auth/web/refresh": () => (cookieValid ? { body: token() } : { status: 401 }),
        "POST /v0/auth/web/logout": () => logout,
      });
      await signInAndSeed(page);
      cookieValid = true;
      const refreshes = () => calls.filter((c) => c.path === "/v0/auth/web/refresh").length;
      const before = refreshes();
      await header(page).getByRole("button", { name: "Sign out" }).click();
      await page.waitForEvent("load");
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      expect(await leftover(page)).toEqual([]);
      // The sign-out is still owed: another reload retries it and still does not refresh.
      await page.reload();
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      expect(refreshes()).toBe(before);
      expect(await page.evaluate(() => localStorage.getItem("goalline-signout-pending"))).toBe("1");
      // Once the server confirms, the flag goes and the next load asks the server again.
      logout = { status: 204 };
      cookieValid = false;
      await page.reload();
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("goalline-signout-pending")))
        .toBeNull();
      await page.reload();
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      await expect.poll(refreshes).toBeGreaterThan(before);
    });
  }
});
