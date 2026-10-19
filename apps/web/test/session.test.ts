import { describe, expect, it } from "vitest";
import { emptySession, inputKind, sessionValue } from "../src/data/session.ts";

const plan = (over: Record<string, unknown>) =>
  ({
    type: "trials",
    target_value: 8,
    trials_per_session: 10,
    prompt_hierarchy: [],
    task_steps: [],
    unit: null,
    ...over,
  }) as never;

describe("sessionValue", () => {
  it("saves nothing before any tap", () => {
    expect(sessionValue(plan({}), emptySession(plan({})))).toBeNull();
  });
  it("scales trials to the session size", () => {
    const p = plan({});
    expect(sessionValue(p, { ...emptySession(p), correct: 4, incorrect: 1 })).toBe(8);
  });
  it("turns percent_correct taps into a percentage", () => {
    const p = plan({ type: "percent_correct", target_value: 80, trials_per_session: null });
    expect(sessionValue(p, { ...emptySession(p), correct: 3, incorrect: 1 })).toBe(75);
  });
  it("counts tallies, converts seconds to minutes and counts completed steps", () => {
    expect(sessionValue(plan({ type: "frequency" }), { ...emptySession(plan({})), count: 3 })).toBe(
      3,
    );
    expect(
      sessionValue(plan({ type: "duration" }), { ...emptySession(plan({})), seconds: 270 }),
    ).toBe(4.5);
    const t = plan({ type: "task_analysis", task_steps: ["a", "b", "c"] });
    expect(sessionValue(t, { ...emptySession(t), steps: [true, false, true] })).toBe(2);
  });
  it("maps every measurement type to an input", () => {
    expect(inputKind(plan({ type: "prompt_level" }))).toBe("level");
    expect(inputKind(plan({ type: "rubric" }))).toBe("rubric");
  });
});
