import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { displayName, scrub, students } from "../src/data/district.ts";
import { agreeToPrivacy, can, isDelegateRole, needsPrivacy, setRole } from "../src/data/roles.ts";
import { shortGoal } from "../src/ui/Home.tsx";
import { SignIn } from "../src/ui/SignIn.tsx";
import {
  addGoal,
  addStudent,
  clearAll,
  deleteGoal,
  getWorkspace,
  loadSample,
  setDelegated,
  setServed,
  useStorage,
} from "../src/data/workspace.ts";

beforeEach(() => {
  useStorage(null);
  setRole("sped_director");
  clearAll();
  loadSample();
});

describe("practice roles", () => {
  it("shows everything to the director and case manager", () => {
    expect(students).toHaveLength(12);
    setRole("case_manager");
    expect(students).toHaveLength(12);
  });

  it("shows nothing before a role is chosen", () => {
    setRole(null);
    expect(students).toHaveLength(0);
  });

  it("shows an SLP only the students marked served", () => {
    const served = getWorkspace().served;
    expect(served.length).toBeGreaterThan(0);
    setRole("related_service_provider");
    expect(students.map((s) => s.student.id).sort()).toEqual([...served].sort());
    const other = getWorkspace().students.find((s) => !served.includes(s.id))!;
    setRole("sped_director");
    setServed(other.id, true);
    setRole("related_service_provider");
    expect(students).toHaveLength(served.length + 1);
  });

  it("shows a para only delegated goals, with first name and goal only", () => {
    const delegated = new Set(getWorkspace().delegated);
    setRole("paraprofessional");
    const goalIds = students.flatMap((s) => s.goals.map((g) => g.goal.id));
    expect(goalIds.length).toBe(delegated.size);
    expect(goalIds.every((g) => delegated.has(g))).toBe(true);
    for (const s of students) {
      expect(s.student.last_name).toBe("");
      expect(s.student.grade).toBe("");
      expect(s.student.local_student_id).toBe("");
      expect(displayName(s.student)).toBe(displayName(s.student).trim());
      expect(displayName(s.student)).not.toContain(" ");
    }
  });

  it("follows sharing changes and deletions", () => {
    const sid = addStudent({ firstName: "Pat", lastName: "Example", grade: "3" });
    const gid = addGoal(sid, {
      area: "math",
      statement: "Practice goal.",
      baseline: "x",
      criteria: "",
      type: "yes_no",
      unit: "",
      targetValue: 1,
      trialsPerSession: null,
      promptHierarchy: [],
      taskSteps: [],
      frequency: "daily",
    });
    setRole("paraprofessional");
    const before = students.length;
    setRole("case_manager");
    setDelegated(gid, true);
    setRole("paraprofessional");
    expect(students).toHaveLength(before + 1);
    setRole("case_manager");
    deleteGoal(gid);
    expect(getWorkspace().delegated).not.toContain(gid);
  });

  it("limits actions by role", () => {
    expect(can("sped_director", "files")).toBe(true);
    expect(can("case_manager", "files")).toBe(false);
    expect(can("related_service_provider", "addStudent")).toBe(false);
    expect(can("related_service_provider", "editGoal")).toBe(true);
    for (const r of ["paraprofessional", "gen_ed_teacher"] as const) {
      expect(isDelegateRole(r)).toBe(true);
      for (const a of ["addStudent", "editGoal", "history", "files", "manageData"] as const)
        expect(can(r, a)).toBe(false);
    }
    expect(can(null, "history")).toBe(false);
  });
});

describe("delegate views", () => {
  it("gives gen-ed teachers a first name only and scrubs the last name from goal text", () => {
    setRole("gen_ed_teacher");
    for (const s of students) {
      expect(s.student.last_name).toBe("");
      const original = getWorkspace().students.find((x) => x.id === s.student.id)!;
      for (const g of s.goals) {
        expect(g.goal.statement.toLowerCase()).not.toContain(original.last_name.toLowerCase());
      }
    }
  });

  it("scrubs a last name only as a whole word, including names ending in punctuation", () => {
    const student = { ...getWorkspace().students[0]!, last_name: "Nee" };
    expect(scrub("Sam Nee reads with the knee brace", student)).toBe(
      "Sam reads with the knee brace",
    );
    expect(scrub("Works with Nee.", student)).toBe("Works with.");
    expect(scrub("Works with Nee's team", student)).toBe("Works with's team");
    const suffixed = { ...student, last_name: "Rivera Jr." };
    expect(scrub("Rivera Jr. reads daily", suffixed)).toBe(" reads daily");
  });

  it("asks paras and gen-ed teachers to agree once per visit", () => {
    expect(needsPrivacy("paraprofessional")).toBe(true);
    agreeToPrivacy("paraprofessional");
    expect(needsPrivacy("paraprofessional")).toBe(false);
    expect(needsPrivacy("sped_director")).toBe(false);
  });
});

describe("sign out and clear", () => {
  it("keeps practice data on sign-out and clears it on request for any role", () => {
    setRole("paraprofessional");
    setRole(null);
    expect(getWorkspace().students.length).toBeGreaterThan(0);
    setRole("case_manager");
    clearAll();
    expect(getWorkspace().students).toHaveLength(0);
  });
});

describe("shortGoal", () => {
  it("cuts at a word near 100 characters", () => {
    const text = "word ".repeat(40).trim();
    const out = shortGoal(text);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out.endsWith("…")).toBe(true);
    expect(shortGoal("short goal")).toBe("short goal");
  });
});

describe("sign-in landing", () => {
  it("opens on the logo, name, practice notice and one Sign in button, with no role choices", () => {
    const html = renderToString(createElement(SignIn));
    expect(html).toContain("GoalLine");
    expect(html).toContain('src="icon.svg"');
    expect(html).toContain("Everything in this app is made up. No real student information.");
    expect(html).toContain("Practice data only. Not for real students.");
    expect(html).toContain(">Sign in<");
    expect(html).not.toContain("Practice Director");
    expect(html).not.toContain("Case manager");
  });
});
