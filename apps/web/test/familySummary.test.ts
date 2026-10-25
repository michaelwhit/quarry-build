import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { familySummary, summaryText } from "../src/data/parentSummary.ts";
import { PERIODS } from "../src/data/reports.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { FamilyPreview, actionHint } from "../src/ui/FamilySummary.tsx";

beforeEach(() => {
  setRole("sped_director");
  loadSample();
});

const preview = (lang: "en" | "es", goalsOf = (g: (typeof students)[number]["goals"]) => g) => {
  const s = students.find((x) => x.goals.length > 0)!;
  const summary = familySummary(s.student, goalsOf(s.goals), PERIODS[0]!, lang);
  return { s, html: renderToString(createElement(FamilyPreview, { summary })) };
};

describe("family summary page", () => {
  it("shows the first-name title and every goal without the last name", () => {
    const { s, html } = preview("en");
    expect(html).toContain("is doing on IEP goals");
    expect(html).not.toContain(s.student.last_name);
    expect(html.match(/<section/g)).toHaveLength(s.goals.length);
  });

  it("marks the page language and shows the Spanish phrases", () => {
    const { html } = preview("es");
    expect(html).toContain('lang="es"');
    expect(html).toContain("Cómo va ");
  });

  it("says so when the student has no goals", () => {
    const { html } = preview("en", () => []);
    expect(html).toContain("This student has no goals yet.");
  });

  it("says so in Spanish too, and the copied text carries it", () => {
    const { html } = preview("es", () => []);
    expect(html).toContain("Este estudiante todavía no tiene metas.");
    const s = students[0]!;
    const text = summaryText(familySummary(s.student, [], PERIODS[0]!, "es"));
    expect(text).toContain("Este estudiante todavía no tiene metas.");
  });

  it("tells the teacher why Copy and Print are off, or that they are ready", () => {
    expect(actionHint(0, false)).toContain("Add a goal");
    expect(actionHint(0, true)).toContain("Add a goal");
    expect(actionHint(2, false)).toContain("after you tick the box");
    expect(actionHint(2, true)).toBe("Ready to copy or print.");
  });
});
