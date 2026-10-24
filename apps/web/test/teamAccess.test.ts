import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { accessLines } from "../src/data/teamAccess.ts";
import { setRole } from "../src/data/roles.ts";
import {
  clearAll,
  getWorkspace,
  loadSample,
  setDelegated,
  setServed,
  useStorage,
} from "../src/data/workspace.ts";
import { TeamSection } from "../src/ui/TeamSection.tsx";

beforeEach(() => {
  useStorage(null);
  setRole("sped_director");
  clearAll();
  loadSample();
});

/** A student who is not served and has no shared goal, so the switches start off. */
function bareStudent() {
  const ws = getWorkspace();
  for (const s of ws.students) setServed(s.id, false);
  for (const g of ws.goals) setDelegated(g.id, false);
  return getWorkspace().students[0]!.id;
}

describe("who else has access", () => {
  it("lists nobody until access is given", () => {
    const id = bareStudent();
    expect(accessLines(getWorkspace(), id)).toEqual([]);
  });

  it("adds the SLP when the student is served, and takes them off again", () => {
    const id = bareStudent();
    setServed(id, true);
    expect(accessLines(getWorkspace(), id).map((l) => l.who)).toEqual([
      "SLP or school psychologist",
    ]);
    setServed(id, false);
    expect(accessLines(getWorkspace(), id)).toEqual([]);
  });

  it("counts the shared goals and names their areas", () => {
    const id = bareStudent();
    const ws = getWorkspace();
    const iep = ws.ieps.find((i) => i.student_id === id)!;
    const goals = ws.goals.filter((g) => g.iep_id === iep.id);
    setDelegated(goals[0]!.id, true);
    const line = accessLines(getWorkspace(), id).find((l) => l.who.startsWith("Paras"))!;
    expect(line.why).toContain(`Data entry on 1 of ${goals.length}`);
    expect(line.why).toContain(goals[0]!.area.replaceAll("_", " "));
  });

  it("shows on the Team section", () => {
    const id = bareStudent();
    expect(renderToString(createElement(TeamSection, { studentId: id }))).not.toContain(
      "Also has access",
    );
    setServed(id, true);
    const html = renderToString(createElement(TeamSection, { studentId: id }));
    expect(html).toContain("Also has access");
    expect(html).toContain("SLP or school psychologist");
  });
});
