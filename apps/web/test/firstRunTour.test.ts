import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FirstRunTour, TOUR_STEPS } from "../src/ui/FirstRunTour.tsx";

describe("First-run tour", () => {
  const html = renderToString(createElement(FirstRunTour));
  it("starts on step one with a way to skip", () => {
    expect(html.replace(/<!-- -->/g, "")).toContain("Step 1 of 4");
    expect(html).toContain("Skip the tour");
    expect(html).toContain("Next");
  });
  it("covers Today, recording data, Caseload and Libraries and nothing else", () => {
    expect(TOUR_STEPS.map((s) => s.title)).toEqual([
      "Today",
      "Record data",
      "Caseload",
      "Libraries",
    ]);
  });
  it("makes no security, compliance or review claims", () => {
    const text = TOUR_STEPS.map((s) => s.text)
      .join(" ")
      .toLowerCase();
    for (const w of ["secure", "compliant", "ferpa", "guarantee", "approved by", "reviewed"])
      expect(text).not.toContain(w);
  });
});
