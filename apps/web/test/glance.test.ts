import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AtAGlanceForParas } from "../src/ui/Glance.tsx";

describe("At a glance for paraprofessionals on the web", () => {
  const html = renderToString(createElement(AtAGlanceForParas)).replaceAll("<!-- -->", "");

  it("says it is planned for the iPhone app and sends the para back to Today", () => {
    expect(html).toContain("At a glance");
    expect(html).toContain("Planned");
    expect(html).toContain("planned for the iPhone app");
    expect(html).toContain('href="#/today"');
  });

  it("shows no student, goal or service", () => {
    expect(html).not.toMatch(/Goals|Services|Measured by|Accommodations and modifications/);
  });
});
