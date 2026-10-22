import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { goals } from "../src/data/library.ts";
import { factsFor, fillFrom, goalInput, oneTap } from "../src/data/libraryFill.ts";
import { setRole } from "../src/data/roles.ts";
import { addGoal, addStudent, clearAll, getWorkspace, useStorage } from "../src/data/workspace.ts";

beforeEach(() => {
  setRole("sped_director");
  const data = new Map<string, string>();
  useStorage({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  });
  clearAll();
});

describe("one tap from a student's record", () => {
  it("reads the name, grade and plan end from the student", () => {
    const id = addStudent({ firstName: "Pat", lastName: "Example", grade: "2" });
    const facts = factsFor(id);
    expect(facts?.name).toContain("Pat");
    expect(facts?.grade).toBe("2");
    const iep = getWorkspace().ieps.find((i) => i.student_id === id);
    expect(facts?.planEnds).toBe(iep?.effective_to);
    expect(factsFor("nope")).toBeNull();
  });

  it("adds a goal with the student's name and the plan end date", () => {
    const id = addStudent({ firstName: "Pat", lastName: "Example", grade: "2" });
    const facts = factsFor(id)!;
    const g = goals.find((x) => x.id === "g-addition")!;
    const values = fillFrom(g, facts, "2000-01-01");
    expect(oneTap(g, values, "2000-01-01")).toBe(true);
    addGoal(id, goalInput(g, values, facts.name));
    const added = students.find((s) => s.student.id === id)?.goals[0]?.goal;
    expect(added?.statement).toContain("Pat");
    expect(added?.statement).not.toContain("[");
    expect(added?.target).toContain("80");
  });
});
