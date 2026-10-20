import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import {
  STORAGE_KEY,
  type StorageLike,
  addGoal,
  addPoint,
  addStudent,
  addStudents,
  clearAll,
  deleteGoal,
  deletePoint,
  deleteStudent,
  exportText,
  importText,
  getWorkspace,
  loadSample,
  parse,
  updateGoal,
  updateStudent,
  useStorage,
} from "../src/data/workspace.ts";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const goal = {
  area: "behavior" as const,
  statement: "Practice goal: stay on task for 10 minutes.",
  baseline: "3 minutes",
  criteria: "in 4 of 5 sessions",
  type: "duration" as const,
  unit: "minutes",
  targetValue: 10,
  trialsPerSession: null,
  promptHierarchy: [],
  taskSteps: [],
  frequency: "2x weekly",
};

let store: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  store = fakeStorage();
  useStorage(store);
  clearAll();
});

describe("practice workspace", () => {
  it("starts empty and builds a student, goal and data point", () => {
    expect(students).toHaveLength(0);
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    expect(students).toHaveLength(1);
    expect(students[0]?.status).toBe("no_data");
    const gid = addGoal(sid, goal);
    expect(students[0]?.goals[0]?.goal.target).toBe("10 minutes");
    addPoint(gid, 4, "visual cue");
    expect(students[0]?.goals[0]?.series).toHaveLength(1);
    expect(students[0]?.goals[0]?.progress.status).not.toBe("no_data");
  });

  it("rejects missing names, a missing student and a bad target", () => {
    expect(() => addStudent({ firstName: " ", lastName: "X", grade: "3" })).toThrow();
    expect(() => addGoal("nope", goal)).toThrow();
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    expect(() => addGoal(sid, { ...goal, targetValue: 0 })).toThrow();
    expect(() => addGoal(sid, { ...goal, statement: "  " })).toThrow();
  });

  it("names a prompt-level target by its level", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "K" });
    addGoal(sid, {
      ...goal,
      type: "prompt_level",
      unit: "",
      targetValue: 3,
      promptHierarchy: ["model", "gestural", "independent"],
    });
    expect(students[0]?.goals[0]?.goal.target).toBe("independent");
  });

  it("keeps a copy in storage, loads samples, and clears everything", () => {
    addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    expect(store.data.get(STORAGE_KEY)).toContain('"synthetic":true');
    loadSample();
    expect(students).toHaveLength(12);
    clearAll();
    expect(students).toHaveLength(0);
    expect(getWorkspace().points).toHaveLength(0);
    expect(store.data.has(STORAGE_KEY)).toBe(false);
  });

  it("still works when storage throws", () => {
    useStorage({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    expect(students).toHaveLength(1);
  });
});

describe("reading stored data back", () => {
  it("drops malformed records and orphans", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    addGoal(sid, goal);
    const good = JSON.parse(store.data.get(STORAGE_KEY) ?? "{}");
    const bad = {
      ...good,
      students: [
        ...good.students,
        { ...good.students[0], id: 7 },
        { ...good.students[0], id: "long-name", first_name: "x".repeat(41) },
        { ...good.students[0], id: "bad-grade", grade: "99" },
      ],
      ieps: [...good.ieps, { ...good.ieps[0], id: "orphan", student_id: "missing" }],
    };
    const out = parse(JSON.stringify(bad));
    expect(out?.students).toHaveLength(1);
    expect(out?.ieps).toHaveLength(1);
    expect(out?.goals).toHaveLength(1);
  });

  it("drops records missing required fields instead of throwing", () => {
    const text = JSON.stringify({
      synthetic: true,
      students: [{ id: "a", first_name: "Pat" }],
      ieps: [{ id: "i", student_id: "a" }],
      goals: [{ id: "g" }],
      plans: [],
      points: [],
    });
    expect(parse(text)).toEqual({ students: [], ieps: [], goals: [], plans: [], points: [] });
  });

  it("refuses text that is not marked synthetic or is not JSON", () => {
    expect(parse("{not json")).toBeNull();
    expect(parse(JSON.stringify({ students: [] }))).toBeNull();
    expect(parse(null)).toBeNull();
  });
});

describe("prompt levels", () => {
  it("builds a goal from de-duplicated levels", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "K" });
    addGoal(sid, {
      ...goal,
      type: "prompt_level",
      unit: "",
      targetValue: 2,
      promptHierarchy: ["model", "independent"],
    });
    expect(students[0]?.goals[0]?.plan.prompt_hierarchy).toEqual(["model", "independent"]);
  });
});

describe("editing and deleting", () => {
  it("edits a student and a goal, keeping recorded data", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    const gid = addGoal(sid, goal);
    addPoint(gid, 4, "");
    updateStudent(sid, { firstName: "Sam", lastName: "Example", grade: "4" });
    updateGoal(gid, {
      area: "math",
      statement: "Practice goal: edited.",
      baseline: "2 minutes",
      criteria: "",
      unit: "minutes",
      frequency: "daily",
      targetValue: 12,
      trialsPerSession: null,
    });
    const v = students[0];
    expect(v?.student.first_name).toBe("Sam");
    expect(v?.student.grade).toBe("4");
    expect(v?.goals[0]?.goal.statement).toBe("Practice goal: edited.");
    expect(v?.goals[0]?.goal.target).toBe("12 minutes");
    expect(v?.goals[0]?.plan.type).toBe("duration");
    expect(v?.goals[0]?.series).toHaveLength(1);
    expect(() => updateStudent("nope", { firstName: "A", lastName: "B", grade: "1" })).toThrow();
    expect(() => updateGoal("nope", { ...goal, targetValue: 1 })).toThrow();
  });

  it("deletes a goal with its data, and a student with everything", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    const other = addStudent({ firstName: "Lee", lastName: "Sample", grade: "2" });
    const g1 = addGoal(sid, goal);
    const g2 = addGoal(other, goal);
    addPoint(g1, 3, "");
    addPoint(g2, 5, "");
    deleteGoal(g1);
    expect(getWorkspace().points).toHaveLength(1);
    expect(getWorkspace().plans).toHaveLength(1);
    deleteStudent(other);
    const ws = getWorkspace();
    expect(ws.students).toHaveLength(1);
    expect([ws.ieps, ws.goals, ws.plans, ws.points].map((a) => a.length)).toEqual([1, 0, 0, 0]);
  });
});

describe("export and import", () => {
  it("round-trips the workspace and refuses other files", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    addPoint(addGoal(sid, goal), 4, "note");
    const text = exportText();
    expect(text).not.toContain("\n");
    clearAll();
    expect(importText("{}").ok).toBe(false);
    expect(importText("not json").ok).toBe(false);
    expect(importText(JSON.stringify({ synthetic: true, students: [] })).ok).toBe(false);
    expect(importText(text)).toEqual({ ok: true, message: "Loaded 1 student." });
    expect(students[0]?.goals[0]?.series).toHaveLength(1);
  });
});

describe("history", () => {
  it("removes one saved session", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    const gid = addGoal(sid, goal);
    addPoint(gid, 3, "");
    addPoint(gid, 5, "");
    const [first] = getWorkspace().points;
    deletePoint(first!.id);
    expect(getWorkspace().points).toHaveLength(1);
    expect(students[0]?.goals[0]?.series).toHaveLength(1);
  });
});

describe("addStudents", () => {
  beforeEach(() => {
    useStorage(fakeStorage());
    clearAll();
  });
  it("adds every student with one save", () => {
    const store = fakeStorage();
    useStorage(store);
    let saves = 0;
    const set = store.setItem;
    store.setItem = (k, v) => {
      saves++;
      set(k, v);
    };
    const ids = addStudents([
      { firstName: "Ava", lastName: "Stone", grade: "3" },
      { firstName: "Ben", lastName: "Reed", grade: "K" },
    ]);
    expect(ids).toHaveLength(2);
    expect(saves).toBe(1);
    expect(getWorkspace().students).toHaveLength(2);
    expect(getWorkspace().ieps).toHaveLength(2);
  });
  it("adds none when one entry is refused", () => {
    expect(() =>
      addStudents([
        { firstName: "Ava", lastName: "Stone", grade: "3" },
        { firstName: " ", lastName: "Reed", grade: "K" },
      ]),
    ).toThrow(/Entry 2/);
    expect(getWorkspace().students).toHaveLength(0);
  });
});
