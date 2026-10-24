import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { caseload_assignments, staff } from "@synthetic/fixtures/demo-district.json";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { teamFor } from "../src/data/team.ts";
import { TeamSection } from "../src/ui/TeamSection.tsx";

const TODAY = "2026-10-21";
const withTeam = caseload_assignments.find((a) => a.relationship === "caseload")!.student_id;
const name = (id: string) => staff.find((p) => p.id === id)!.display_name;

beforeEach(() => setRole("sped_director"));

describe("student team", () => {
  it("lists the case manager first, with a plain role and tie", () => {
    const team = teamFor(withTeam, TODAY);
    expect(team.length).toBeGreaterThan(0);
    expect(team[0]!.tie).toBe("Case manager");
    const cm = caseload_assignments.find(
      (a) => a.student_id === withTeam && a.relationship === "caseload",
    )!;
    expect(team[0]!.name).toBe(name(cm.staff_id));
    expect(team.every((m) => m.role !== "" && m.tie !== "")).toBe(true);
  });

  it("leaves out assignments that ended or have not started", () => {
    expect(teamFor(withTeam, "2020-01-01")).toEqual([]);
    const ended = caseload_assignments.find((a) => a.end_date !== null);
    if (ended)
      expect(teamFor(ended.student_id, "9999-12-31").map((m) => m.id)).not.toContain(ended.id);
  });

  it("is empty for a student with no assignments", () => {
    expect(teamFor("nobody", TODAY)).toEqual([]);
  });

  it("renders for staff, says when empty, and hides names from paras", () => {
    expect(renderToString(createElement(TeamSection, { studentId: withTeam }))).toContain("Team");
    expect(renderToString(createElement(TeamSection, { studentId: "nobody" }))).toContain(
      "No team listed yet.",
    );
    setRole("paraprofessional");
    expect(renderToString(createElement(TeamSection, { studentId: withTeam }))).toBe("");
  });
});
