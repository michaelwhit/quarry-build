import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  goalSessionValue,
  isMastered,
  phaseGate,
  type Criterion,
  type PhaseEvent,
  type Point,
} from "./reference-rules.ts";

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../vectors/${name}.json`, import.meta.url), "utf8")) as T;

type Trial = [prompt: string, correct: boolean];

/**
 * Display and mastery vectors added for the instruction-planning spec (2.7) and the prompted-response decision.
 * The Swift package that holds the decision rules must pass the same files; here a separate
 * TypeScript reading checks that the vectors say what the spec says.
 */
describe("phase-gate display vectors", () => {
  const v = load<{
    cases: {
      name: string;
      direction: ">=" | "<=";
      points: Point[];
      events: PhaseEvent[];
      gate: "on" | "off";
      raw: string;
      shown: string;
      waiting: { since: string; have: number } | null;
    }[];
    open_questions: string[];
    assumptions: string[];
  }>("phase-gate");

  it.each(v.cases)("$name", ({ direction, points, events, gate, raw, shown, waiting }) => {
    // The aim line is level at 50, so "below" and "above" are plain comparisons with 50.
    const out = phaseGate(
      points,
      points.map(() => 50),
      direction,
      events,
      gate,
    );
    expect(out).toEqual({ raw, shown, waiting });
  });

  it("never changes the rule itself: the raw result is the same with and without a change", () => {
    for (const c of v.cases.filter((x) => x.gate === "on")) {
      const plain = phaseGate(
        c.points,
        c.points.map(() => 50),
        c.direction,
        [],
      );
      expect(plain.raw, c.name).toBe(c.raw);
    }
  });

  it("writes down what the spec leaves open, and asks nothing it has answered", () => {
    expect(v.open_questions).toEqual([]);
    expect(v.assumptions.length).toBeGreaterThan(0);
  });
});

describe("prompted corrects and mastery vectors", () => {
  const v = load<{
    open_questions: string[];
    value_cases: {
      name: string;
      written_with_prompting: boolean;
      prompt_ceiling: string | null;
      trials: Trial[];
      value: number;
    }[];
    mastery_cases: {
      name: string;
      criterion: Criterion;
      days: Trial[][];
      with_prompting: { prompt_ceiling: string; values: number[]; mastered: boolean };
      without_prompting: { prompt_ceiling: null; values: number[]; mastered: boolean };
    }[];
  }>("mastery-prompting");

  describe("session value", () => {
    it.each(v.value_cases)("$name", ({ written_with_prompting, prompt_ceiling, trials, value }) => {
      // A goal not written with prompting has no ceiling; one written with prompting has one.
      expect(prompt_ceiling === null, "ceiling matches the setting").toBe(!written_with_prompting);
      expect(goalSessionValue(trials, prompt_ceiling)).toBe(value);
    });
  });

  describe("mastery from trials", () => {
    it.each(v.mastery_cases)("$name", ({ criterion, days, with_prompting, without_prompting }) => {
      for (const [side, ceiling] of [
        [with_prompting, with_prompting.prompt_ceiling],
        [without_prompting, null],
      ] as const) {
        const values = days.map((t) => goalSessionValue(t, ceiling));
        expect(values).toEqual(side.values);
        expect(isMastered(criterion, values)).toBe(side.mastered);
      }
    });
  });

  it("has no unanswered questions left", () => {
    expect(v.open_questions).toEqual([]);
  });
});
