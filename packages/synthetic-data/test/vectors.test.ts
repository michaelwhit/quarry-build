import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aimLine,
  fourPointRule,
  isBlockedFrequency,
  isMastered,
  isStale,
  maintenanceDue,
  sessionValueWithCeiling,
  trendStatus,
  type Criterion,
  type Point,
  type Session,
} from "./reference-rules.ts";

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../vectors/${name}.json`, import.meta.url), "utf8")) as T;

/**
 * The vectors in packages/synthetic-data/vectors are the shared answer key for the rules in the
 * libraries and monitoring spec and the decisions in product/rule-decisions-2026-10-18.md. The
 * Swift package that implements the rules loads the same files, and so does the server lint for
 * blocked frequencies. Here a separate TypeScript reading must agree with every vector, so a wrong
 * vector is caught before it misleads the other tests.
 */
describe("blocked frequency vectors (spec 7.2, BF-1, BF-2)", () => {
  const v = load<{ cases: { name: string; text: string; blocked: boolean }[] }>(
    "blocked-frequencies",
  );
  it.each(v.cases)("$name", ({ text, blocked }) => {
    expect(isBlockedFrequency(text)).toBe(blocked);
  });
});

describe("mastery vectors (spec 2.4, MA-1 to MA-4)", () => {
  const v = load<{
    cases: { name: string; criterion: Criterion; sessions: Session[]; mastered: boolean }[];
    prompt_ceiling_cases: {
      name: string;
      ceiling: string;
      trials: [string, boolean][];
      value: number;
    }[];
    maintenance_calendar: { no_school: string[] };
    maintenance_cases: { name: string; mastery: string; due: [string, string] }[];
  }>("mastery");

  it.each(v.cases)("$name", ({ criterion, sessions, mastered }) => {
    expect(isMastered(criterion, sessions)).toBe(mastered);
  });

  describe("prompt ceiling", () => {
    it.each(v.prompt_ceiling_cases)("$name", ({ ceiling, trials, value }) => {
      expect(sessionValueWithCeiling(trials, ceiling)).toBe(value);
    });
  });

  describe("maintenance due dates", () => {
    it.each(v.maintenance_cases)("$name", ({ mastery, due }) => {
      expect(maintenanceDue(mastery, v.maintenance_calendar)).toEqual(due);
    });
  });
});

describe("decision rule vectors (spec 2.5, DR-1 to DR-6)", () => {
  const v = load<{
    aim_line: {
      name: string;
      points: Point[];
      end: string;
      target: number;
      baseline: number | null;
      at: Record<string, number>;
    }[];
    four_point: {
      name: string;
      aim: "flat50";
      direction: ">=" | "<=";
      points: number[];
      advice: string;
    }[];
    trend: {
      name: string;
      aim_slope_per_day: number;
      direction: ">=" | "<=";
      points: Point[];
      status: string;
    }[];
    stale: {
      calendar: { no_school: string[] };
      cases: {
        name: string;
        last_data: string | null;
        goal_start: string | null;
        attached_on: string | null;
        as_of: string;
        stale: boolean;
      }[];
    };
  }>("decision-rules");

  describe("aim line", () => {
    it.each(v.aim_line)("$name", ({ points, end, target, baseline, at }) => {
      const aim = aimLine(points, end, target);
      if (baseline === null) return expect(aim).toBeNull();
      expect(aim?.baseline).toBe(baseline);
      for (const [date, value] of Object.entries(at)) expect(aim?.at(date)).toBeCloseTo(value, 9);
    });
  });

  describe("four-point rule", () => {
    it.each(v.four_point)("$name", ({ points, direction, advice }) => {
      // "flat50": the aim line is level at 50 for every point.
      expect(
        fourPointRule(
          points,
          points.map(() => 50),
          direction,
        ),
      ).toBe(advice);
    });
  });

  describe("trend against the aim line", () => {
    it.each(v.trend)("$name", ({ points, aim_slope_per_day, direction, status }) => {
      expect(trendStatus(points, aim_slope_per_day, direction)).toBe(status);
    });
  });

  describe("stale data", () => {
    it.each(v.stale.cases)("$name", ({ last_data, goal_start, attached_on, as_of, stale }) => {
      expect(isStale(last_data, as_of, v.stale.calendar, goal_start, attached_on)).toBe(stale);
    });
  });
});

describe("vector files", () => {
  it("have no unanswered questions left", () => {
    for (const name of ["blocked-frequencies", "mastery", "decision-rules"]) {
      const f = load<{ open_questions: string[] }>(name);
      expect(f.open_questions, name).toEqual([]);
    }
  });
});
