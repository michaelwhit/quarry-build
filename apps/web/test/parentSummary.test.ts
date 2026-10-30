import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { familySummary, summaryText } from "../src/data/parentSummary.ts";
import { PERIODS } from "../src/data/reports.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";

beforeEach(() => {
  setRole("sped_director");
  loadSample();
});

const pick = () => students.find((s) => s.goals.length > 0)!;

describe("family summary", () => {
  it("uses the first name only and names each goal's area", () => {
    const s = pick();
    const out = familySummary(s.student, s.goals, PERIODS[0]!, "en");
    expect(out.title).toBe(
      `How ${s.student.preferred_name ?? s.student.first_name} is doing on IEP goals`,
    );
    expect(out.goals).toHaveLength(s.goals.length);
    const text = summaryText(out);
    expect(text).not.toContain(s.student.last_name);
    expect(text).not.toContain(s.student.id);
  });

  it("gives the same goals in Spanish with fixed phrases and flags the goal wording", () => {
    const s = pick();
    const en = familySummary(s.student, s.goals, PERIODS[0]!, "en");
    const es = familySummary(s.student, s.goals, PERIODS[0]!, "es");
    expect(es.goals).toHaveLength(en.goals.length);
    expect(es.title.startsWith("Cómo va ")).toBe(true);
    expect(es.goals[0]!.statement).toBe(en.goals[0]!.statement);
    expect(es.goals[0]!.note).toContain("en inglés");
    expect(en.goals[0]!.note).toBe("");
    expect(summaryText(es)).toContain("Meta:");
  });

  it("writes the numbers as short sentences with a target, not 'aim'", () => {
    const s = students.find((x) => x.goals.length > 0)!;
    const out = familySummary(s.student, s.goals, PERIODS[0]!, "en");
    const line = out.goals.map((g) => g.progress).find((l) => l !== "");
    expect(line).toBeDefined();
    expect(line).toMatch(/recorded\. Started at .+\. Most recent: .+\. Target: .+\.$/);
    expect(line).not.toContain("aim");
  });

  it("says plainly when nothing was recorded in the period", () => {
    const s = pick();
    const empty = { ...PERIODS[0]!, start: "2001-01-01", end: "2001-01-02" };
    expect(familySummary(s.student, s.goals, empty, "en").goals[0]!.status).toBe(
      "No progress was recorded in this period.",
    );
    expect(familySummary(s.student, s.goals, empty, "es").goals[0]!.status).toBe(
      "No se registró progreso en este período.",
    );
  });
});
