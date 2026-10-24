import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { TrackGoal } from "../src/ui/Track.tsx";

const first = () => {
  const s = students.find((x) => x.goals.length > 0)!;
  return { studentId: s.student.id, goalId: s.goals[0]!.goal.id };
};

beforeEach(() => {
  setRole("sped_director");
  loadSample();
});

describe("Track: progress report button", () => {
  it("links to the student's report for roles that can open reports", () => {
    const { studentId, goalId } = first();
    for (const role of ["sped_director", "case_manager"] as const) {
      setRole(role);
      const html = renderToString(createElement(TrackGoal, { studentId, goalId }));
      expect(html).toContain(`href="#/student/${studentId}/report"`);
    }
  });

  it("shows no report button to roles that cannot open reports", () => {
    const { studentId, goalId } = first();
    setRole("paraprofessional");
    const html = renderToString(createElement(TrackGoal, { studentId, goalId }));
    expect(html).not.toContain("/report");
    setRole(null);
  });
});
