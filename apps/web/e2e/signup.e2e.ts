import { expect, test, type Page } from "@playwright/test";
import { fakeApi, openLanding, person, SIGNIN_URL, token, type Handler } from "./fakeApi.ts";

// Sign-up in the build made with a sign-in server address (server answered by the test). Nobody
// types a password to sign up: the director's setup code is how they set one later.
test.use({ baseURL: SIGNIN_URL });

const signedOut: Record<string, Handler> = { "POST /v0/auth/web/refresh": { status: 401 } };
const SCHOOLS = {
  schools: [
    {
      id: "s1",
      name: "Sample Elementary",
      town: "Sampletown",
      district: "Demo District (synthetic)",
    },
    { id: "s2", name: "Sample High School", town: null, district: "Demo District (synthetic)" },
  ],
};

async function openSchoolSignup(page: Page) {
  await openLanding(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign up with my school" }).click();
  await expect(page.getByRole("heading", { name: "Sign up with my school" })).toBeVisible();
}

test.describe("sign up with my school", () => {
  test("search starts at three letters, a pick is confirmed, and the request has no password", async ({
    page,
  }) => {
    const calls = await fakeApi(page, {
      ...signedOut,
      "GET /v0/auth/schools": { body: SCHOOLS },
      "POST /v0/auth/signup": { status: 202, body: { status: "pending" } },
    });
    await openSchoolSignup(page);
    const search = page.getByLabel("Your school (type at least 3 letters)");
    await search.fill("Sa");
    await page.waitForTimeout(800);
    expect(calls.filter((c) => c.path === "/v0/auth/schools")).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Request access" })).toBeDisabled();
    await search.fill("Sample");
    await page.getByRole("button", { name: /Sample Elementary/ }).click();
    await expect(page.getByRole("button", { name: "Change school" })).toBeVisible();
    await page.getByLabel("Your name").fill("Sample Person");
    await page.getByLabel("Work email").fill("sample@example.test");
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByRole("heading", { name: "Thanks. Waiting for approval" })).toBeVisible();
    const sent = calls.find((c) => c.path === "/v0/auth/signup");
    expect(sent?.body).toMatchObject({
      schoolId: "s1",
      email: "sample@example.test",
      displayName: "Sample Person",
    });
    expect(Object.keys(sent?.body ?? {}).sort()).toEqual([
      "deviceId",
      "displayName",
      "email",
      "schoolId",
    ]);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
  });

  test("no matching school says to check the spelling or ask for an invite code", async ({
    page,
  }) => {
    await fakeApi(page, { ...signedOut, "GET /v0/auth/schools": { body: { schools: [] } } });
    await openSchoolSignup(page);
    await page.getByLabel("Your school (type at least 3 letters)").fill("Nowhere");
    await expect(page.getByText(/No schools found. Check the spelling/)).toBeVisible();
  });

  test("a school that is not taking sign-ups says to ask for an invite code", async ({ page }) => {
    await fakeApi(page, {
      ...signedOut,
      "GET /v0/auth/schools": { body: SCHOOLS },
      "POST /v0/auth/signup": { status: 401 },
    });
    await openSchoolSignup(page);
    await page.getByLabel("Your school (type at least 3 letters)").fill("Sample");
    await page.getByRole("button", { name: /Sample High School/ }).click();
    await page.getByLabel("Your name").fill("Sample Person");
    await page.getByLabel("Work email").fill("sample@example.test");
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByText("That school isn't taking sign-ups.")).toBeVisible();
  });

  test("too many searches says how long to wait", async ({ page }) => {
    await fakeApi(page, {
      ...signedOut,
      "GET /v0/auth/schools": { status: 429, headers: { "Retry-After": "60" } },
    });
    await openSchoolSignup(page);
    await page.getByLabel("Your school (type at least 3 letters)").fill("Sample");
    await expect(page.getByRole("alert")).toHaveText(
      "Too many tries. Wait a minute and try again.",
    );
  });
});

test.describe("sign up with an invite code", () => {
  async function openInvite(page: Page) {
    await openLanding(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "I have an invite code" }).click();
  }

  test("the form asks for a code, a name and an email, and no password", async ({ page }) => {
    const calls = await fakeApi(page, {
      ...signedOut,
      "POST /v0/auth/signup": { status: 403, body: { status: "pending" } },
    });
    await openInvite(page);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByLabel("Invite code").fill("INVITE-1234");
    await page.getByLabel("Your name").fill("Sample Person");
    await page.getByLabel("Work email").fill("sample@example.test");
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByRole("heading", { name: "Thanks. Waiting for approval" })).toBeVisible();
    expect(calls.find((c) => c.path === "/v0/auth/signup")?.body).toMatchObject({
      code: "INVITE-1234",
      email: "sample@example.test",
      displayName: "Sample Person",
    });
  });

  test("a used or old code says to ask the director for a new one", async ({ page }) => {
    await fakeApi(page, { ...signedOut, "POST /v0/auth/signup": { status: 401 } });
    await openInvite(page);
    await page.getByLabel("Invite code").fill("USED");
    await page.getByLabel("Your name").fill("Sample Person");
    await page.getByLabel("Work email").fill("sample@example.test");
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(
      page.getByText("That invite code didn't work. Ask your director for a new one."),
    ).toBeVisible();
  });
});

test.describe("the director approves a sign-up", () => {
  test("approval shows the setup code once, in a dialog, until it is hidden", async ({ page }) => {
    const calls = await fakeApi(page, {
      "POST /v0/auth/web/refresh": { body: token() },
      "GET /v0/me": { body: person("sped_director", "Sample Director") },
      "GET /v0/staff/signups": {
        body: {
          signups: [
            {
              id: "u1",
              email: "new@example.test",
              display_name: "New Person",
              created_at: "2026-10-20T10:00:00Z",
              expires_at: "2026-11-20T10:00:00Z",
              via: "school",
              email_domain_matched: true,
            },
          ],
        },
      },
      "POST /v0/staff/signups/u1/approve": {
        status: 201,
        body: {
          role: "case_manager",
          setup_code: "SETUP-AAAA-1111",
          setup_code_expires_at: "2026-10-24T10:00:00Z",
        },
      },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "I understand" }).click();
    await page.getByRole("link", { name: /Staff and roles/ }).click();
    await expect(page.getByRole("heading", { name: "Waiting for approval (1)" })).toBeVisible();
    await page.getByLabel("Role").selectOption("case_manager");
    await page.getByRole("button", { name: "Approve" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Setup code for New Person");
    await expect(dialog).toContainText("SETUP-AAAA-1111");
    await expect(dialog).toContainText("Confirm this is really New Person");
    expect(calls.find((c) => c.path.endsWith("/approve"))?.body).toMatchObject({
      role: "case_manager",
    });
    await dialog.getByRole("button", { name: "Done, hide the code" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText("SETUP-AAAA-1111")).toHaveCount(0);
  });
});
