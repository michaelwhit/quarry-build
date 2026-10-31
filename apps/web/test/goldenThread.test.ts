import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import { buildThread, needArea } from "../src/data/goldenThread.ts";
import {
  type Area,
  blankStatement,
  confirmEvidence,
  getPl,
  resetPlForTests,
  saveStatement,
  usePlStorage,
} from "../src/data/presentLevels.ts";

setRole("sped_director");

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const ctx = { who: "Ms. A", now: new Date("2026-10-21T15:00:00Z") };
const today = "2026-10-21";

function addNeed(studentId: string, area: Area, text: string, confirm = true) {
  const rec = getPl(studentId);
  const s = { ...blankStatement(rec), kind: "need" as const, area, text };
  saveStatement(rec, s, ctx);
  if (confirm) confirmEvidence(getPl(studentId), s.id, ctx, today);
}

beforeEach(() => {
  loadSample();
  usePlStorage(mem());
  resetPlForTests();
});

describe("needArea", () => {
  it("files reading and writing under reading, math under math, the rest under other", () => {
    expect(needArea("reading")).toBe("reading");
    expect(needArea("written_expression")).toBe("reading");
    expect(needArea("math")).toBe("math");
    for (const a of ["communication", "social_emotional", "behavior", "adaptive", "motor"] as const)
      expect(needArea(a)).toBe("other");
  });
});

describe("buildThread", () => {
  it("is empty for an unknown student", () => {
    expect(buildThread("nobody")).toEqual({ rows: [], flags: [] });
  });

  it("gives one row per goal, with the aim, the plan and a status", () => {
    const v = students.find((s) => s.goals.length > 0)!;
    const t = buildThread(v.student.id);
    expect(t.rows).toHaveLength(v.goals.length);
    for (const r of t.rows) {
      expect(r.statement).not.toBe("");
      expect(r.aim).toContain("Target:");
      expect(r.measured).toMatch(/, target .*, recorded /);
      expect(r.status).not.toBe("");
    }
  });

  it("reports the last data point, or says there is none", () => {
    const withData = students.find((s) => s.goals.some((g) => g.series.length > 0))!;
    const g = withData.goals.find((x) => x.series.length > 0)!;
    const row = buildThread(withData.student.id).rows.find((r) => r.goalId === g.goal.id)!;
    expect(row.latest).toMatch(/ on [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    const empty = students
      .flatMap((s) => s.goals.map((x) => ({ s, x })))
      .find((o) => o.x.series.length === 0);
    if (empty) {
      const t = buildThread(empty.s.student.id);
      expect(t.rows.find((r) => r.goalId === empty.x.goal.id)!.latest).toBe("");
      expect(t.flags.some((f) => f.level === "info" && f.text.includes("no data yet"))).toBe(true);
    }
  });

  it("shows only confirmed needs under the matching area, and flags the rest", () => {
    const v = students.find((s) => s.goals.some((g) => g.goal.area === "reading"))!;
    addNeed(v.student.id, "reading", "Needs help decoding multi-syllable words.", false);
    let t = buildThread(v.student.id);
    expect(t.rows.find((r) => r.area === "reading")!.needs).toEqual([]);
    expect(t.flags.some((f) => f.level === "amber" && f.text.includes("no confirmed need"))).toBe(
      true,
    );
    const rec = getPl(v.student.id);
    confirmEvidence(rec, rec.statements[0]!.id, ctx, today);
    t = buildThread(v.student.id);
    expect(t.rows.find((r) => r.area === "reading")!.needs).toEqual([
      "Needs help decoding multi-syllable words.",
    ]);
  });

  it("flags a confirmed need in an area with no goal", () => {
    const v = students.find((s) => !s.goals.some((g) => g.goal.area === "math"))!;
    addNeed(v.student.id, "math", "Needs support with number sense.");
    const t = buildThread(v.student.id);
    expect(t.flags.some((f) => f.level === "amber" && f.text.includes("no goal covers it"))).toBe(
      true,
    );
  });
});
