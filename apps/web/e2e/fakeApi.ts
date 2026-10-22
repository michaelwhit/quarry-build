import type { Page } from "@playwright/test";

// The sign-in build (see build-signin.mjs) is served here, and its server address is answered
// by the test in the browser, so no server runs and each test chooses what the server says.
export const SIGNIN_URL = "http://127.0.0.1:4180";
const API = "http://127.0.0.1:4181";

export interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** The server cannot be reached. */
  down?: boolean;
}
export type Handler = Reply | ((body: Record<string, unknown>) => Reply);
export interface Call {
  path: string;
  body: Record<string, unknown>;
  auth: string | undefined;
}

export const token = () => ({
  status: "signed_in",
  access_token: "test-access-token",
  access_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
});

export const person = (role: string, name = "Sample Person") => ({
  id: "p1",
  display_name: name,
  email: "sample@example.test",
  role,
});

/** Answers "METHOD /path" for the sign-in server. A path with no handler answers 404. */
export async function fakeApi(page: Page, handlers: Record<string, Handler>): Promise<Call[]> {
  const calls: Call[] = [];
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const cors = {
      "Access-Control-Allow-Origin": SIGNIN_URL,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "Retry-After",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GoalLine-Client",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname;
    let body: Record<string, unknown> = {};
    try {
      body = (req.postDataJSON() as Record<string, unknown> | null) ?? {};
    } catch {
      // A GET has no body.
    }
    calls.push({ path, body, auth: req.headers()["authorization"] });
    const h = handlers[`${req.method()} ${path}`];
    const r = typeof h === "function" ? h(body) : h;
    if (!r) return route.fulfill({ status: 404, headers: cors });
    if (r.down) return route.abort("failed");
    return route.fulfill({
      status: r.status ?? 200,
      headers: { ...cors, "Content-Type": "application/json", ...r.headers },
      body: JSON.stringify(r.body ?? {}),
    });
  });
  return calls;
}

/**
 * Opens the landing page and waits until the page has heard back from the server about a live
 * session. A click on "Sign in" before that answer arrives can be lost, which is not what these
 * tests are about.
 */
export async function openLanding(page: Page) {
  const checked = page.waitForResponse((r) => r.url().endsWith("/v0/auth/web/refresh"));
  await page.goto("/");
  await checked;
}
