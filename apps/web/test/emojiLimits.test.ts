import { describe, expect, it } from "vitest";
import { isMyGoal } from "../src/data/myItems.ts";
import { type GoalForTemplate, draftMyGoal } from "../src/data/myItemsFromGoal.ts";

// A title of 120 emoji is within the 120-character limit but 240 UTF-16 units. It has to be kept
// and read back, not cut in half or thrown away as too long.
const EMOJI = "😀";
const goal: GoalForTemplate = {
  title: "Add within 20",
  statement:
    "Given 10 single-digit addition problems, Yara will write the correct sum for 8 of 10 problems in 3 consecutive sessions by 2027-05-20.",
  criteria: "At or above 80%, 3 times in a row",
  area: "math",
  type: "percent_correct",
  unit: "percent",
  targetValue: 80,
  trialsPerSession: null,
  promptHierarchy: [],
  taskSteps: [],
  names: ["Yara"],
  gradeBand: "K-2",
};

describe("My items title", () => {
  it("keeps a 120-emoji title whole and cuts a longer one at 120 characters", () => {
    const keep = draftMyGoal({ ...goal, title: EMOJI.repeat(120) }, "2026-10-22").item;
    expect(keep.title).toBe(EMOJI.repeat(120));
    expect(isMyGoal({ ...keep, id: "my-1" })).toBe(true);
    const cut = draftMyGoal({ ...goal, title: EMOJI.repeat(130) }, "2026-10-22").item;
    expect(cut.title).toBe(EMOJI.repeat(120));
    expect([...cut.title].every((c) => c === EMOJI)).toBe(true);
  });
  it("still refuses a 121-character title read back from storage", () => {
    const item = draftMyGoal(goal, "2026-10-22").item;
    expect(isMyGoal({ ...item, id: "my-1", title: EMOJI.repeat(121) })).toBe(false);
  });
});
