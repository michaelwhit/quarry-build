import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Waiting } from "../src/auth/Waiting.tsx";

// Server rendering puts comment markers between text pieces; compare the text as a reader sees it.
const render = (email: string) =>
  renderToString(createElement(Waiting, { email, onSetupCode() {}, onBack() {} })).replaceAll(
    "<!-- -->",
    "",
  );

describe("the waiting-for-approval screen", () => {
  it("says what happens next, shows the account that is waiting, and offers two ways on", () => {
    const html = render("sample@example.test");
    expect(html).toContain("Waiting for approval");
    expect(html).toContain("give you a setup code in person");
    expect(html).toContain("Signed up as sample@example.test");
    expect(html).toContain("I have a setup code");
    expect(html).toContain("Back to sign in");
  });

  it("offers nothing that opens the app: no role list, no tabs, no sign-out of a session", () => {
    const html = render("sample@example.test");
    expect(html).not.toMatch(/tab|Home|Caseload|Sign out|role/i);
  });

  it("leaves the account line out when there is no address, and never lets it inject markup", () => {
    expect(render("  ")).not.toContain("Signed up as");
    const html = render("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
