import { expect, test, type Page } from "@playwright/test";
import { fakeApi, openLanding, person, SIGNIN_URL, token, type Handler } from "./fakeApi.ts";
import { header, watchErrors } from "./helpers.ts";

// The real sign-in screens, in the build made with a sign-in server address. The server is
// answered by the test (see fakeApi.ts); nothing here is a real account.
test.use({ baseURL: SIGNIN_URL });

const ok: Record<string, Handler> = {
  "POST /v0/auth/web/refresh": { status: 401 },
  "GET /v0/me": { body: person("case_manager", "Sample Person") },
  "POST /v0/auth/web/logout": { status: 204 },
};

async function openSignIn(page: Page) {
  await openLanding(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
}

async function typePassword(page: Page, password = "correct horse battery staple") {
  await page.getByLabel("Work email").fill("sample@example.test");
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const signedIn = (page: Page) =>
  expect(header(page).getByRole("button", { name: "Sign out" })).toBeVisible();

/** The student-privacy notice every sign-in meets first. */
const understand = (page: Page) => page.getByRole("button", { name: "I understand" }).click();

test.describe("the landing page with a sign-in server", () => {
  test("has Sign in and Sign up, and Sign up opens the invite form with no password box", async ({
    page,
  }) => {
    await fakeApi(page, ok);
    await openLanding(page);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up", exact: true })).toBeVisible();
    await expect(
      page.getByText("New here? Sign up. Your director will approve you."),
    ).toBeVisible();
    // No practice shortcut beside a real sign-in.
    await expect(page.getByText(/sign in as a sample user/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign up with an invite code" })).toBeVisible();
    await expect(page.getByLabel("Invite code")).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
  });
});

test.describe("password sign-in", () => {
  test("a good password signs in, asks for the person, and sign-out tells the server", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const calls = await fakeApi(page, { ...ok, "POST /v0/auth/password": { body: token() } });
    await openSignIn(page);
    await typePassword(page);
    await understand(page);
    await signedIn(page);
    const sent = calls.find((c) => c.path === "/v0/auth/password");
    expect(sent?.body).toMatchObject({ email: "sample@example.test" });
    expect(sent?.body["deviceId"]).toEqual(expect.any(String));
    expect(calls.find((c) => c.path === "/v0/me")?.auth).toBe("Bearer test-access-token");
    await header(page).getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "GoalLine", level: 2 })).toBeVisible();
    // The page shows the landing screen first and tells the server a moment later.
    await expect.poll(() => calls.some((c) => c.path === "/v0/auth/web/logout")).toBe(true);
    // Not the signed-out 401 the page expects on load: the page's own policy must allow every call.
    expect(
      errors.filter((e) => /Content Security Policy|pageerror|request failed/.test(e)),
    ).toEqual([]);
  });

  test("the password can be shown and is cleared after a wrong one", async ({ page }) => {
    await fakeApi(page, { ...ok, "POST /v0/auth/password": { status: 401 } });
    await openSignIn(page);
    const field = page.getByLabel(/^Password/);
    await expect(field).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await typePassword(page, "not the right one");
    await expect(
      page.getByText("That email and password don't match an account that can sign in."),
    ).toBeVisible();
    await expect(field).toHaveValue("");
  });

  test("too many tries says how long to wait, in whole minutes", async ({ page }) => {
    await fakeApi(page, {
      ...ok,
      "POST /v0/auth/password": { status: 429, headers: { "Retry-After": "150" } },
    });
    await openSignIn(page);
    await typePassword(page);
    await expect(page.getByText("Too many tries. Wait 3 minutes and try again.")).toBeVisible();
  });

  test("a server that cannot be reached says so and keeps the screen", async ({ page }) => {
    await fakeApi(page, { ...ok, "POST /v0/auth/password": { down: true } });
    await openSignIn(page);
    await typePassword(page);
    await expect(page.getByText(/Can't reach the GoalLine server/)).toBeVisible();
    await expect(page.getByLabel("Work email")).toHaveValue("sample@example.test");
  });

  test("an account still waiting for approval gets the waiting screen, and can go back", async ({
    page,
  }) => {
    await fakeApi(page, {
      ...ok,
      "POST /v0/auth/password": { status: 403, body: { status: "pending" } },
    });
    await openSignIn(page);
    await typePassword(page);
    await expect(page.getByRole("heading", { name: "Thanks. Waiting for approval" })).toBeVisible();
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
  });

  test("an account with no authenticator yet is told to ask the director", async ({ page }) => {
    await fakeApi(page, {
      ...ok,
      "POST /v0/auth/password": { status: 403, body: { status: "second_factor_setup_needed" } },
    });
    await openSignIn(page);
    await typePassword(page);
    await expect(page.getByText(/Ask your director for a reset code/)).toBeVisible();
  });
});

test.describe("setup code", () => {
  test("a weak password lists the rules it broke, then a good one goes on to the authenticator", async ({
    page,
  }) => {
    let n = 0;
    const calls = await fakeApi(page, {
      ...ok,
      "POST /v0/auth/set-password": () =>
        ++n === 1
          ? { status: 422, body: { problems: ["too_short", "common", "not_a_known_rule"] } }
          : { body: { status: "enrol_second_factor", challenge: "c1" } },
      "POST /v0/auth/second-factor/enrol": {
        body: { otpauth_uri: "otpauth://x", secret: "ABCD EFGH" },
      },
    });
    await openSignIn(page);
    await page.getByRole("button", { name: "I have a setup code" }).click();
    await page.getByLabel("Setup code from your director").fill("SETUP-1234");
    await page.getByLabel("Work email").fill("sample@example.test");
    await page.getByLabel("New password").fill("short");
    await page.getByRole("button", { name: "Set your password" }).click();
    await expect(page.getByText("Use at least 14 characters.")).toBeVisible();
    await expect(page.getByText(/too common or has appeared in a data breach/)).toBeVisible();
    await expect(page.getByLabel("New password")).toHaveValue("");
    await page.getByLabel("New password").fill("a long phrase of unrelated words");
    await page.getByRole("button", { name: "Set your password" }).click();
    await expect(
      page.getByRole("heading", { name: "Set up your authenticator app" }),
    ).toBeVisible();
    expect(calls.filter((c) => c.path === "/v0/auth/set-password")[0]?.body).toMatchObject({
      email: "sample@example.test",
      code: "SETUP-1234",
    });
  });

  test("an old setup code says to ask for a new one", async ({ page }) => {
    await fakeApi(page, { ...ok, "POST /v0/auth/set-password": { status: 401 } });
    await openSignIn(page);
    await page.getByRole("button", { name: "I have a setup code" }).click();
    await page.getByLabel("Setup code from your director").fill("OLD-CODE");
    await page.getByLabel("Work email").fill("sample@example.test");
    await page.getByLabel("New password").fill("a long phrase of unrelated words");
    await page.getByRole("button", { name: "Set your password" }).click();
    await expect(page.getByText(/It may have expired or been used/)).toBeVisible();
  });
});

test.describe("second factor", () => {
  const toFactor: Record<string, Handler> = {
    ...ok,
    "POST /v0/auth/password": { body: { status: "second_factor", challenge: "c1" } },
  };

  test("a wrong code stays on the screen; the right one signs in", async ({ page }) => {
    let n = 0;
    const calls = await fakeApi(page, {
      ...toFactor,
      "POST /v0/auth/second-factor": () => (++n === 1 ? { status: 401 } : { body: token() }),
    });
    await openSignIn(page);
    await typePassword(page);
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByText(/That code didn't work. Check the time on your phone/),
    ).toBeVisible();
    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await signedIn(page);
    const sent = calls.filter((c) => c.path === "/v0/auth/second-factor");
    expect(sent.map((c) => c.body["code"])).toEqual(["000000", "123456"]);
    expect(sent[1]?.body["challenge"]).toBe("c1");
  });

  test("a recovery code works and says how many are left", async ({ page }) => {
    const calls = await fakeApi(page, {
      ...toFactor,
      "POST /v0/auth/second-factor": { body: { ...token(), recovery_codes_left: 1 } },
    });
    await openSignIn(page);
    await typePassword(page);
    await page.getByRole("button", { name: "Use a recovery code" }).click();
    await page.getByLabel("Recovery code").fill("ABCD-EFGH");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("You have 1 recovery code left.")).toBeVisible();
    expect(calls.find((c) => c.path === "/v0/auth/second-factor")?.body).toMatchObject({
      recoveryCode: "ABCD-EFGH",
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await signedIn(page);
  });

  test("start again goes back to the password", async ({ page }) => {
    await fakeApi(page, toFactor);
    await openSignIn(page);
    await typePassword(page);
    await page.getByRole("button", { name: "Start again from my password" }).click();
    await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
  });
});

test("first sign-in sets up the authenticator and shows the recovery codes once", async ({
  page,
}) => {
  const calls = await fakeApi(page, {
    ...ok,
    "POST /v0/auth/password": { body: { status: "enrol_second_factor", challenge: "c2" } },
    "POST /v0/auth/second-factor/enrol": {
      body: { otpauth_uri: "otpauth://totp/x", secret: "ABCDEFGHIJKLMNOP" },
    },
    "POST /v0/auth/second-factor/enrol/confirm": {
      body: { ...token(), recovery_codes: ["AAAA-1111", "BBBB-2222"] },
    },
  });
  await openSignIn(page);
  await typePassword(page);
  await expect(page.getByLabel("Setup key")).toHaveText("ABCD EFGH IJKL MNOP");
  await page.getByLabel("6-digit code from the app").fill("123456");
  await page.getByRole("button", { name: "Turn on and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await expect(page.getByText("AAAA-1111")).toBeVisible();
  await expect(page.getByText("BBBB-2222")).toBeVisible();
  await page.getByRole("button", { name: "I saved them" }).click();
  await signedIn(page);
  expect(calls.find((c) => c.path.endsWith("/enrol/confirm"))?.body).toMatchObject({
    challenge: "c2",
    code: "123456",
  });
});

test.describe("coming back to the page", () => {
  test("a live session signs straight in, without the sign-in button", async ({ page }) => {
    await fakeApi(page, {
      "POST /v0/auth/web/refresh": { body: token() },
      "GET /v0/me": { body: person("sped_director") },
    });
    await page.goto("/");
    await signedIn(page);
  });

  test("a server that is not there says so, and Try again checks again", async ({ page }) => {
    let up = false;
    await fakeApi(page, {
      "POST /v0/auth/web/refresh": () => (up ? { status: 401 } : { status: 404 }),
    });
    await page.goto("/");
    await expect(page.getByText(/Can't reach the GoalLine server/)).toBeVisible();
    up = true;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(/Can't reach the GoalLine server/)).toBeHidden();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });
});
