import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Graph } from "../src/ui/Graph.tsx";

const series = [
  { at: "2026-09-01T12:00:00Z", value: 2 },
  { at: "2026-09-08T12:00:00Z", value: 4 },
];
const draw = (reportHref?: string) =>
  renderToString(
    createElement(Graph, {
      series,
      target: 8,
      label: "reading goal",
      unit: "words",
      ...(reportHref === undefined ? {} : { reportHref }),
    }),
  );

describe("Graph progress report button", () => {
  it("shows a Progress report button that links to the report when given an address", () => {
    const html = draw("#/student/s1/report");
    expect(html).toContain('href="#/student/s1/report"');
    expect(html).toContain("Progress report");
  });
  it("shows no button when there is no address", () => {
    expect(draw()).not.toContain("Progress report");
  });
});
