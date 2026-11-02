import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageTitle } from "../src/data/title.ts";
import { Accessibility } from "../src/ui/Accessibility.tsx";

describe("Accessibility page", () => {
  const html = renderToString(createElement(Accessibility));
  it("has the three sections and a placeholder report line", () => {
    expect(html).toContain("What is checked");
    expect(html).toContain("What is not checked");
    expect(html).toContain("Report a problem");
    expect(html).toContain("Placeholder wording");
  });
  it("says it is not a full audit and makes no compliance claims", () => {
    expect(html).toContain("not a full audit");
    for (const w of ["compliant", "WCAG", "ADA", "certified", "guarantee", "approved by"])
      expect(html).not.toContain(w);
  });
  it("is titled", () => {
    expect(pageTitle("#/accessibility", "Accessibility")).toBe("Accessibility · GoalLine");
  });
});
