import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { setRole, type RoleId } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { FamilySummary } from "../src/ui/FamilySummary.tsx";
import { ProgressReport, ReportsDue } from "../src/ui/ProgressReport.tsx";

beforeEach(() => {
  setRole("sped_director");
  loadSample();
});

const sid = () => students[0]!.student.id;
// The surname as the director sees it; read it before switching to a role that must not see it.
const surname = () => students[0]!.student.last_name;
const plain = (html: string) => html.replace(/<!-- -->/g, "");
const blocked: RoleId[] = ["paraprofessional", "gen_ed_teacher"];

describe("progress report and family summary screens render on the server", () => {
  for (const role of blocked) {
    it(`${role}: the progress report is a plain not-available page`, () => {
      const name = surname();
      setRole(role);
      const html = renderToString(createElement(ProgressReport, { studentId: sid() }));
      expect(html).toContain("Not available for this role");
      expect(html).toContain("Sign in as the director or a case manager");
      expect(html).not.toContain(name);
    });
    it(`${role}: the family summary is a plain not-available page`, () => {
      const name = surname();
      setRole(role);
      const html = renderToString(createElement(FamilySummary, { studentId: sid() }));
      expect(html).toContain("Not available for this role");
      expect(html).not.toContain(name);
    });
    it(`${role}: the reports-due list is empty`, () => {
      setRole(role);
      expect(renderToString(createElement(ReportsDue))).toBe("");
    });
  }
  it("a missing student gets a way back on both screens", () => {
    for (const C of [ProgressReport, FamilySummary]) {
      const html = renderToString(createElement(C, { studentId: "no-such-student" }));
      expect(html).toContain("Student not found.");
      expect(html).toContain('href="#/"');
    }
  });
  it("the director sees the reports-due list with a link to each student's report", () => {
    const html = plain(renderToString(createElement(ReportsDue)));
    expect(html).toMatch(/\d+ progress reports? due/);
    expect(html).toContain(`href="#/student/${sid()}/report"`);
  });
});
