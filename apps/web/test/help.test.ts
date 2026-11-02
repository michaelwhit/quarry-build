import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageTitle } from "../src/data/title.ts";
import { setRole } from "../src/data/roles.ts";
import { Help } from "../src/ui/Help.tsx";
import { More } from "../src/ui/Home.tsx";

describe("Help page", () => {
  const html = renderToString(createElement(Help));
  it("has the three sections", () => {
    expect(html).toContain("What GoalLine does");
    expect(html).toContain("What it does not do");
    expect(html).toContain("Who to ask");
  });
  it("says SRS stays the official record and marks the who-to-ask line as a placeholder", () => {
    expect(html).toContain("SRS stays the official record");
    expect(html).toContain("Placeholder wording");
  });
  it("makes no security, compliance or review claims", () => {
    for (const w of ["secure", "compliant", "FERPA", "guarantee", "approved by", "reviewed"])
      expect(html.toLowerCase()).not.toContain(w.toLowerCase());
  });
  it("is linked from More and titled", () => {
    setRole("case_manager");
    expect(renderToString(createElement(More))).toContain('href="#/help"');
    setRole(null);
    expect(pageTitle("#/help", "Help")).toBe("Help · GoalLine");
  });
});
