import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { setRole } from "../src/data/roles.ts";
import { clearAll } from "../src/data/workspace.ts";
import { CaseloadEmpty } from "../src/ui/CaseloadEmpty.tsx";
import { Due } from "../src/ui/Due.tsx";
import { Overdue } from "../src/ui/Overdue.tsx";

const html = (c: Parameters<typeof createElement>[0]) =>
  renderToString(createElement(c)).replace(/<!-- -->/g, "");

describe("screens with no students loaded", () => {
  it("the caseload offers a way forward to the director and none to a role that cannot add", () => {
    setRole("sped_director");
    clearAll();
    expect(students.length).toBe(0);
    const director = html(CaseloadEmpty);
    expect(director).toContain("Add a student");
    expect(director).toContain("Load sample students");
    setRole("paraprofessional");
    const para = html(CaseloadEmpty);
    expect(para).not.toContain("Add a student");
    expect(para).toContain("No students are shared with this role yet");
  });

  it("What's due and Progress reports to file both say the reports are made up", () => {
    setRole("sped_director");
    clearAll();
    for (const screen of [Due, Overdue]) {
      const out = html(screen);
      expect(out).toContain("Made-up reports");
    }
  });
});
