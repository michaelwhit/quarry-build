import { beforeEach, describe, expect, it } from "vitest";
import {
  MY_ITEMS_FILE_FORMAT,
  exportMyItems,
  hasMyItems,
  importMyItems,
} from "../src/data/myItemsFile.ts";
import {
  addMyAccommodation,
  getMyAccommodations,
  resetMyAccommodationsForTests,
  setMyAccommodationsStorageForTests,
} from "../src/data/myAccommodations.ts";
import {
  addMyGoal,
  getMyGoals,
  resetMyItemsForTests,
  setMyItemsStorageForTests,
} from "../src/data/myItems.ts";
import { draftMyGoal, type GoalForTemplate } from "../src/data/myItemsFromGoal.ts";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
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
const acc = {
  title: "Extra time",
  kind: "accommodation" as const,
  category: "Timing",
  description: "More time on tests.",
  location: "Classroom",
  frequency: "On timed work",
  duration: "This plan",
};

beforeEach(() => {
  setMyItemsStorageForTests(mem());
  setMyAccommodationsStorageForTests(mem());
  resetMyItemsForTests();
  resetMyAccommodationsForTests();
});

describe("My items file", () => {
  it("round-trips: what is saved loads into an empty list, and again says it is already there", () => {
    expect(hasMyItems()).toBe(false);
    addMyGoal(draftMyGoal(goal, "2026-10-22").item);
    addMyAccommodation(acc);
    const text = exportMyItems();
    expect(JSON.parse(text).format).toBe(MY_ITEMS_FILE_FORMAT);
    resetMyItemsForTests();
    resetMyAccommodationsForTests();
    const res = importMyItems(text);
    expect(res.added).toBe(2);
    expect(res.message).toBe("Added 1 goal and 1 accommodation to My items.");
    expect(getMyGoals()).toHaveLength(1);
    expect(getMyAccommodations()).toHaveLength(1);
    const again = importMyItems(text);
    expect(again.added).toBe(0);
    expect(again.message).toContain("Left out 2");
  });
  it("refuses a file that is not ours, is not JSON or is too large", () => {
    expect(importMyItems("nope").message).toBe("That is not a My items file.");
    expect(importMyItems(JSON.stringify({ goals: [] })).message).toBe(
      "That is not a My items file.",
    );
    expect(importMyItems("x".repeat(1_000_001)).message).toBe("That file is too large.");
  });
  it("leaves out entries that fail the same test as saved ones, and never takes an id from the file", () => {
    const text = JSON.stringify({
      format: MY_ITEMS_FILE_FORMAT,
      version: 1,
      goals: [{ id: "my-x", title: "no template" }, 7],
      accommodations: [
        { ...acc, id: "mya-file-id" },
        { ...acc, id: "a-time", title: "Library id" },
      ],
    });
    const res = importMyItems(text);
    expect(res.added).toBe(1);
    expect(res.message).toContain("Left out 3");
    expect(getMyAccommodations()[0]?.id).not.toBe("mya-file-id");
  });
});
