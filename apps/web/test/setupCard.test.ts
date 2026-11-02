import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { SETUP_TEXT, SetupCardView } from "../src/auth/SetupCard.tsx";
import { Home } from "../src/ui/Home.tsx";

const view = (waiting: number) => renderToString(createElement(SetupCardView, { waiting }));

describe("director setup card", () => {
  it("shows nothing when no one is waiting", () => {
    expect(view(0)).toBe("");
  });
  it("says one person, or how many, and links to Staff and roles", () => {
    expect(view(1)).toContain(SETUP_TEXT.one);
    expect(view(3)).toContain("3 people asked to join and are waiting for you.");
    expect(view(3)).toContain('href="#/staff"');
  });
  it("carries only a count: no names, emails or codes, and no claims", () => {
    const text = JSON.stringify(SETUP_TEXT).toLowerCase() + view(2).toLowerCase();
    for (const w of ["secure", "complian", "approved", "code:", "@"]) expect(text).not.toContain(w);
  });
  it("is not on the practice build's Home, which has no sign-in server", () => {
    setRole("sped_director");
    expect(renderToString(createElement(Home))).not.toContain(SETUP_TEXT.title);
    setRole(null);
  });
});
