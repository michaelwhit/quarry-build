import { expect, test, type Page } from "@playwright/test";
import { SIGNIN_URL } from "./fakeApi.ts";
import { signIn, tabBar, watchErrors } from "./helpers.ts";

// The service worker keeps the app shell so the page opens with no network, and it never keeps
// anything from the sign-in server or about students. The practice data sits in local storage.
async function controlled(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // Reload once so the worker serves this page and keeps the files it loads.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await page.reload();
}

const cachedUrls = (page: Page) =>
  page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys()) out.push(req.url);
    return out;
  });

test.describe("offline app shell", () => {
  test("with the network off the app opens and the practice data is still there", async ({
    page,
    context,
  }) => {
    const errors = watchErrors(page);
    await controlled(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "More" }).click();
    await page.getByRole("button", { name: "Load sample students" }).click();
    await expect(page.getByText(/12 students/)).toBeVisible();

    await context.setOffline(true);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "More" }).click();
    await expect(page.getByText(/12 students/)).toBeVisible();
    await tabBar(page).getByRole("link", { name: "Caseload" }).click();
    await expect(page.locator("ul.cards .name").first()).toBeVisible();
    // Only the network failures from going offline are expected; nothing else broke.
    expect(errors.filter((e) => !e.startsWith("request failed:"))).toEqual([]);
  });

  test("the kept files are the shell only: no student data and no API address", async ({
    page,
  }) => {
    await controlled(page);
    await signIn(page, "director");
    await tabBar(page).getByRole("link", { name: "More" }).click();
    await page.getByRole("button", { name: "Load sample students" }).click();
    await expect(page.getByText(/12 students/)).toBeVisible();
    const urls = await cachedUrls(page);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      const { pathname } = new URL(u);
      expect(pathname, u).not.toMatch(/\/api\/|\/v0\//);
      expect(pathname, u).toMatch(/\/$|\.(webmanifest|svg|js|css|png|woff2?)$/);
    }
  });

  test.describe("the build with a sign-in server", () => {
    test.use({ baseURL: SIGNIN_URL });
    test("never keeps a file from the sign-in server", async ({ page }) => {
      await controlled(page);
      const urls = await cachedUrls(page);
      expect(urls.length).toBeGreaterThan(0);
      for (const u of urls) {
        expect(new URL(u).origin, u).toBe(SIGNIN_URL);
        expect(new URL(u).pathname, u).not.toMatch(/\/api\/|\/v0\//);
      }
    });
  });
});
