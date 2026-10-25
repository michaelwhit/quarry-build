import { beforeEach, describe, expect, it } from "vitest";
import { filterGoals } from "../src/data/libraryFilter.ts";
import {
  MAX_MY_GOALS,
  MY_ITEMS_KEY,
  addMyGoal,
  clearMyGoals,
  getMyGoals,
  isMyGoal,
  removeMyGoal,
  resetMyItemsForTests,
  setMyItemsStorageForTests,
} from "../src/data/myItems.ts";
import {
  type GoalForTemplate,
  conditionAndBehavior,
  draftMyGoal,
  templateText,
  windowFrom,
} from "../src/data/myItemsFromGoal.ts";
import { checks, renderedText } from "../src/data/libraryText.ts";

const TODAY = "2026-10-22";
const names = ["Yara", "Gomez", "Yari"];
const good: GoalForTemplate = {
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
  names,
  gradeBand: "K-2",
};

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    store: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    },
  };
};

beforeEach(() => {
  setMyItemsStorageForTests(memory().store);
  resetMyItemsForTests();
});

describe("templateText", () => {
  it("replaces each name as a whole word and every date with a blank", () => {
    expect(templateText(good.statement, names)).toBe(
      "Given 10 single-digit addition problems, {student} will write the correct sum for 8 of 10 problems in 3 consecutive sessions by {date}.",
    );
    expect(templateText("Yara Gomez and Yarasoft; yara", names)).toBe(
      "{student} {student} and Yarasoft; yara",
    );
  });
  it("keeps the other words when the student is named Will", () => {
    expect(templateText("Given a book, Will will read for 5 minutes.", ["Will"])).toBe(
      "Given a book, {student} will read for 5 minutes.",
    );
    expect(templateText("Ann reads", ["Ann", "student"])).toBe("{student} reads");
  });
  it("recognizes a written-out date and turns typed braces into parentheses", () => {
    expect(templateText("Sam will read {fast} by May 20, 2027.", ["Sam"])).toBe(
      "{student} will read (fast) by {date}.",
    );
  });
  it("ignores one-letter names so a middle initial does not break words", () => {
    expect(templateText("A student will read an A word", ["A"])).toBe(
      "A student will read an A word",
    );
  });
});

describe("conditionAndBehavior and windowFrom", () => {
  it("splits the wording around the student", () => {
    expect(
      conditionAndBehavior("Given a passage, {student} will read aloud with 90 percent accuracy."),
    ).toEqual({ condition: "Given a passage", behavior: "read aloud" });
    expect(conditionAndBehavior("The student reads well.")).toEqual({
      condition: "",
      behavior: "",
    });
  });
  it("finds how often", () => {
    expect(windowFrom("4 of 5 sessions", "")).toMatchObject({
      window_kind: "best_of",
      window_count: 4,
      window_of: 5,
    });
    expect(windowFrom("", "3 consecutive sessions")).toMatchObject({
      window_kind: "consecutive",
      window_count: 3,
    });
    expect(windowFrom("", "sometimes")).toMatchObject({ window_count: 0 });
    expect(windowFrom("", "in 3 of 4 checks")).toMatchObject({
      window_kind: "best_of",
      window_count: 3,
      window_of: 4,
    });
  });
  it("does not read accuracy inside a session as the number of sessions", () => {
    expect(
      windowFrom("", "write the sum for 8 of 10 problems in 3 consecutive sessions"),
    ).toMatchObject({
      window_kind: "consecutive",
      window_count: 3,
      window_of: 3,
    });
    expect(windowFrom("", "write the sum for 8 of 10 problems")).toMatchObject({ window_count: 0 });
    expect(draftMyGoal(good, TODAY).item.mastery).toMatchObject({
      window_kind: "consecutive",
      window_count: 3,
    });
  });
});

describe("draftMyGoal", () => {
  it("makes a fillable template that passes the library checks", () => {
    const { item, notes } = draftMyGoal(good, TODAY);
    expect(notes).toEqual([]);
    expect(item.slots).toEqual([{ name: "date", kind: "date" }]);
    expect(item.grade_bands).toEqual(["K-2"]);
    expect(renderedText(item, { date: "2027-05-20" }, "Sam")).toContain("Sam will write");
    expect(checks(item, { date: "2027-05-20" }, TODAY).every((c) => c.pass)).toBe(true);
  });
  it("says what a loose wording lacks", () => {
    const { notes } = draftMyGoal(
      { ...good, statement: "Yara will understand fractions as needed.", criteria: "" },
      TODAY,
    );
    const ids = notes.map((n) => n.id);
    expect(ids).toContain("condition");
    expect(ids).toContain("observable");
    expect(ids).toContain("criterion");
    expect(ids).toContain("date");
  });
  it("takes the student's name out of the title and the steps too", () => {
    const { item } = draftMyGoal(
      {
        ...good,
        title: "Yara adds",
        type: "task_analysis",
        taskSteps: ["Yara picks a card", "Count up"],
        promptHierarchy: ["Yara alone"],
      },
      TODAY,
    );
    expect(item.title).toBe("the student adds");
    expect(item.task_steps).toEqual(["the student picks a card", "Count up"]);
    expect(item.prompt_hierarchy).toEqual(["the student alone"]);
    expect(JSON.stringify(item)).not.toContain("Yara");
  });
  it("has no grade band when the grade is unknown", () => {
    expect(draftMyGoal({ ...good, gradeBand: null }, TODAY).item.grade_bands).toEqual([]);
  });
});

describe("My items store", () => {
  const draft = () => draftMyGoal(good, TODAY).item;

  it("adds, lists, finds by search, and removes", () => {
    const r = addMyGoal(draft());
    expect(r.ok && r.kept).toBe(true);
    expect(getMyGoals()).toHaveLength(1);
    const found = filterGoals(getMyGoals(), { query: "addition", band: "", area: "" });
    expect(found).toHaveLength(1);
    removeMyGoal(getMyGoals()[0]!.id);
    expect(getMyGoals()).toHaveLength(0);
  });
  it("does not save the same wording twice", () => {
    addMyGoal(draft());
    expect(addMyGoal(draft())).toEqual({ ok: false, reason: "duplicate" });
  });
  it("stops at the limit", () => {
    for (let i = 0; i < MAX_MY_GOALS; i++)
      addMyGoal({ ...draft(), template_text: `{student} will read ${i}` });
    expect(addMyGoal({ ...draft(), template_text: "{student} will one more" })).toEqual({
      ok: false,
      reason: "full",
    });
  });
  it("keeps items across a reload and drops unreadable ones", () => {
    const m = memory();
    setMyItemsStorageForTests(m.store);
    resetMyItemsForTests();
    addMyGoal(draft());
    const saved = m.data.get(MY_ITEMS_KEY)!;
    const parsed = JSON.parse(saved) as unknown[];
    m.data.set(MY_ITEMS_KEY, JSON.stringify([...parsed, { id: "my-bad", title: 3 }, "x", null]));
    setMyItemsStorageForTests(m.store);
    expect(getMyGoals()).toHaveLength(1);
    m.data.set(MY_ITEMS_KEY, "not json");
    setMyItemsStorageForTests(m.store);
    expect(getMyGoals()).toEqual([]);
  });
  it("says so when the browser will not keep it, and still works for the visit", () => {
    setMyItemsStorageForTests({
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
    });
    const r = addMyGoal(draft());
    expect(r.ok && r.kept).toBe(false);
    expect(getMyGoals()).toHaveLength(1);
    setMyItemsStorageForTests(null);
  });
  it("rejects stored items that are not mine or are malformed", () => {
    const ok = { ...draft(), id: "my-1" };
    expect(isMyGoal(ok)).toBe(true);
    expect(isMyGoal({ ...ok, id: "g-cvc" })).toBe(false);
    expect(isMyGoal({ ...ok, area: "nonsense" })).toBe(false);
    expect(isMyGoal({ ...ok, type: "nonsense" })).toBe(false);
    expect(isMyGoal({ ...ok, grade_bands: ["13"] })).toBe(false);
    expect(isMyGoal({ ...ok, mastery: { ...ok.mastery, unit: undefined } })).toBe(false);
    expect(isMyGoal({ ...ok, slots: Array(11).fill({ name: "date", kind: "date" }) })).toBe(false);
    expect(isMyGoal({ ...ok, mastery: { ...ok.mastery, window_count: "3" } })).toBe(false);
  });
  it("refuses an item that would not load back, such as one with a too-long step", () => {
    const long = { ...draft(), task_steps: ["x".repeat(400)] };
    expect(addMyGoal(long)).toEqual({ ok: false, reason: "invalid" });
    expect(getMyGoals()).toHaveLength(0);
  });
  it("does not take an inherited object key as an area", () => {
    const ok = { ...draft(), id: "my-1" };
    expect(isMyGoal({ ...ok, area: "toString" })).toBe(false);
    expect(isMyGoal({ ...ok, area: "constructor" })).toBe(false);
  });
  it("clears everything", () => {
    addMyGoal(draft());
    clearMyGoals();
    expect(getMyGoals()).toEqual([]);
  });
});
