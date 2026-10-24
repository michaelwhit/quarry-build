import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Libraries } from "../src/ui/Libraries.tsx";

describe("libraries screen landmarks", () => {
  const html = renderToString(createElement(Libraries, {}));

  it("names the tab group and the search area", () => {
    expect(html).toContain('role="group" aria-label="Library"');
    expect(html).toContain('role="search" aria-label="Search and filter the library"');
  });

  it("labels every filter and announces the result count", () => {
    for (const label of ["Search the library", "Grade band", "Goal area"])
      expect(html).toContain(`aria-label="${label}"`);
    expect(html).toMatch(/role="status"[^>]*>\d+ of \d+ goals/);
  });
});
