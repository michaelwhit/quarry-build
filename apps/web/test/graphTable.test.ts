import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Graph, fmtDateYear } from "../src/ui/Graph.tsx";

describe("graph data table", () => {
  it("spells out the year in the date", () => {
    expect(fmtDateYear("2026-12-18T15:00:00Z")).toBe("Dec 18, 2026");
    expect(fmtDateYear("2027-01-08T15:00:00Z")).toBe("Jan 8, 2027");
  });

  it("shows the year in every table row", () => {
    const html = renderToString(
      createElement(Graph, {
        series: [
          { at: "2026-12-18T15:00:00Z", value: 40 },
          { at: "2027-01-08T15:00:00Z", value: 55 },
        ],
        target: 80,
        label: "Reading goal",
        unit: "percent",
      }),
    );
    expect(html).toContain("<td>Dec 18, 2026</td>");
    expect(html).toContain("<td>Jan 8, 2027</td>");
  });
});
