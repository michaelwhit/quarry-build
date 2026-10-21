import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { Home } from "../src/ui/Home.tsx";
import { Libraries } from "../src/ui/Libraries.tsx";
import { PRIVACY_POINTS, Privacy } from "../src/ui/SignIn.tsx";
import { setRole } from "../src/data/roles.ts";
import { clearAll, loadSample, useStorage } from "../src/data/workspace.ts";

beforeEach(() => {
  useStorage(null);
  setRole("sped_director");
  clearAll();
  loadSample();
});

describe("Home tiles", () => {
  it("open the libraries instead of saying Planned", () => {
    const html = renderToString(createElement(Home));
    expect(html).toContain('href="#/libraries"');
    expect(html).toContain('href="#/libraries/accommodations"');
    expect(html).not.toMatch(/Goal library[^]{0,200}Planned/);
  });

  it("opens the libraries on the tab asked for", () => {
    const goals = renderToString(createElement(Libraries));
    const accommodations = renderToString(createElement(Libraries, { start: "accommodations" }));
    expect(goals).toContain('aria-pressed="true"');
    expect(accommodations).not.toBe(goals);
  });
});

describe("student privacy page", () => {
  it("lists the same points as the native app and needs the checkbox before continuing", () => {
    const html = renderToString(createElement(Privacy, { role: "paraprofessional" }));
    expect(PRIVACY_POINTS).toHaveLength(5);
    for (const point of PRIVACY_POINTS) expect(html).toContain(point.replace(/'/g, "&#x27;"));
    expect(html).toContain("I have read this and I agree.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>I agree, continue<\/button>/);
    expect(html).toContain("Proposed wording. Not final until the district approves it.");
  });
});
