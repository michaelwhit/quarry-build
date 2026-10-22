import { defineConfig, devices } from "@playwright/test";

// Browser smoke tests against the built page (apps/web/dist), served the way a static host serves
// it, with the same Content-Security-Policy the app is built for. `pnpm test:e2e` builds first.
// A second build has a sign-in server address (it must match e2e/fakeApi.ts); its specs answer for
// that server in the browser.
const PORT = 4179;
const SIGNIN_PORT = 4180;
const SIGNIN_API = "http://127.0.0.1:4181";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: [
    {
      command: `node e2e/server.mjs ${PORT}`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: !process.env["CI"],
    },
    {
      command: `node e2e/server.mjs ${SIGNIN_PORT} dist-signin ${SIGNIN_API}`,
      url: `http://127.0.0.1:${SIGNIN_PORT}/`,
      reuseExistingServer: !process.env["CI"],
    },
  ],
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
