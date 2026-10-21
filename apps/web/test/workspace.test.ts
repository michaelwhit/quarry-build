import { setRole } from "../src/data/roles.ts";
import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import {
  STORAGE_KEY,
  type StorageLike,
  addGoal,
  addPoint,
  addAccommodation,
  addStudent,
  removeAccommodation,
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
  setRole("sped_director");
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
    expect(parse(text)).toEqual({
      students: [],
      ieps: [],
      goals: [],
      plans: [],
      points: [],
      accommodations: [],
      served: [],
      delegated: [],
    });
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

describe("import modes", () => {
  it("adds only new students and leaves existing ones alone, or replaces everything", () => {
    const a = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    addPoint(addGoal(a, goal), 4, "note");
    const text = exportText();
    clearAll();
    addStudent({ firstName: "Sam", lastName: "Sample", grade: "4" });
    expect(importText(text, "add")).toEqual({ ok: true, message: "Added 1 student." });
    expect(getWorkspace().students).toHaveLength(2);
    expect(getWorkspace().points).toHaveLength(1);
    expect(importText(text, "add").message).toBe(
      "Added 0 students; 1 already here and left as they are.",
    );
    expect(getWorkspace().students).toHaveLength(2);
    expect(getWorkspace().points).toHaveLength(1);
    expect(importText(text, "replace").ok).toBe(true);
    expect(getWorkspace().students).toHaveLength(1);
    expect(importText("not json", "add").ok).toBe(false);
  });
});

describe("import add keeps ids unique", () => {
  it("skips records whose own id is already here or repeated in the file", () => {
    const a = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    addPoint(addGoal(a, goal), 4, "note");
    const ws = JSON.parse(exportText());
    const twin = { ...ws.goals[0], id: "new-goal", iep_id: "new-iep" };
    const crafted = {
      ...ws,
      students: [{ ...ws.students[0], id: "new-student" }],
      ieps: [{ ...ws.ieps[0], id: "new-iep", student_id: "new-student" }],
      // One goal reuses an id already here, one is new but listed twice.
      goals: [{ ...ws.goals[0], iep_id: "new-iep" }, twin, twin],
      plans: [...ws.plans, { ...ws.plans[0], goal_id: "new-goal" }],
      points: [...ws.points, { ...ws.points[0], id: "new-point", goal_id: "new-goal" }],
      served: ["new-student", "new-student"],
      delegated: ["new-goal", "new-goal"],
    };
    expect(importText(JSON.stringify(crafted), "add").ok).toBe(true);
    const out = getWorkspace();
    expect(out.students).toHaveLength(2);
    expect(out.goals.map((g) => g.id).sort()).toEqual([ws.goals[0].id, "new-goal"].sort());
    expect(out.plans).toHaveLength(2);
    expect(new Set(out.served).size).toBe(out.served.length);
    expect(new Set(out.delegated).size).toBe(out.delegated.length);
    expect(out.points.map((p) => p.id).sort()).toEqual([ws.points[0].id, "new-point"].sort());
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

describe("accommodations on a student", () => {
  const acc = {
    title: "Extra time",
    kind: "accommodation",
    description: "More time on tests.",
    location: "In class",
    frequency: "On tests",
    duration: "For this plan",
  };
  beforeEach(() => {
    useStorage(fakeStorage());
    clearAll();
  });
  it("adds once, removes, and goes with the student", () => {
    const sid = addStudent({ firstName: "Ava", lastName: "Stone", grade: "3" });
    const aid = addAccommodation(sid, acc);
    expect(getWorkspace().accommodations).toHaveLength(1);
    expect(() => addAccommodation(sid, acc)).toThrow(/already/);
    removeAccommodation(aid);
    expect(getWorkspace().accommodations).toHaveLength(0);
    addAccommodation(sid, acc);
    deleteStudent(sid);
    expect(getWorkspace().accommodations).toHaveLength(0);
  });
  it("survives a save and load, and drops ones with no student", () => {
    const sid = addStudent({ firstName: "Ava", lastName: "Stone", grade: "3" });
    addAccommodation(sid, acc);
    const text = exportText();
    expect(parse(text)?.accommodations).toHaveLength(1);
    const broken = JSON.parse(text);
    broken.accommodations.push({ ...broken.accommodations[0], id: "x", student_id: "gone" });
    expect(parse(JSON.stringify(broken))?.accommodations).toHaveLength(1);
  });
});
