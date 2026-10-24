import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample, useStorage } from "../src/data/workspace.ts";
import { draftPwn } from "../src/data/pwn.ts";
import { gatherPwn } from "../src/data/pwnSources.ts";
import {
  approveBox,
  getPwnEntry,
  resetPwnForTests,
  setPwnEntry,
  usePwnStorage,
} from "../src/data/pwnStore.ts";
import { PriorWrittenNotice, canUsePwn } from "../src/ui/PriorWrittenNotice.tsx";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;
const draw = (id = sid()) =>
  renderToString(createElement(PriorWrittenNotice, { studentId: id })).replaceAll("<!-- -->", "");

beforeEach(() => {
  useStorage(null);
  setRole("sped_director");
  loadSample();
  usePwnStorage(mem());
  resetPwnForTests();
});

describe("Prior Written Notice screen", () => {
  it("opens with the entries form, what to finish first, and every box with what is missing", () => {
    const html = draw();
    expect(html).toContain("Prior Written Notice draft");
    expect(html).toContain("Finish first");
    expect(html).toContain("Extended school year: choose not needed or needed.");
    expect(html).toContain("Your entries");
    for (const b of draftPwn(gatherPwn(sid()).input).boxes) expect(html).toContain(b.label);
    expect(html).not.toContain("Copy Contact for questions");
    expect(html).not.toMatch(/\b(filed|accepted)\b/i);
  });

  it("offers approval for a ready box, then Copy once approved", () => {
    setPwnEntry(sid(), { contact: { name: "Pat Example", role: "Case manager", phone: "" } });
    let html = draw();
    expect(html).toContain("Pat Example, Case manager");
    expect(html).toContain("I read this and approve it");
    expect(html).not.toContain("Copy Contact for questions");
    const draft = draftPwn(gatherPwn(sid()).input);
    expect(approveBox(sid(), draft, "contact")).toBe(true);
    html = draw();
    expect(html).toContain("Copy Contact for questions");
    expect(html).toContain("Approved. Changing any entry clears this.");
  });

  it("does not show an unset service or goal as if a change had been chosen", () => {
    const html = draw();
    expect(html).toContain("Not chosen (the draft says Added)");
    const id = students[0]!.goals[0]!.goal.id;
    setPwnEntry(sid(), { changes: { [id]: "changed" } });
    expect(draw().match(/Not chosen/g)?.length ?? 0).toBeLessThan(
      html.match(/Not chosen/g)!.length,
    );
  });

  it("takes the approval away when an entry changes", () => {
    setPwnEntry(sid(), { contact: { name: "Pat Example", role: "Case manager", phone: "" } });
    approveBox(sid(), draftPwn(gatherPwn(sid()).input), "contact");
    expect(Object.keys(getPwnEntry(sid()).approved)).toContain("contact");
    setPwnEntry(sid(), { reasons: ["Needs more support."] });
    expect(Object.keys(getPwnEntry(sid()).approved)).toEqual([]);
    expect(draw()).not.toContain("Copy Contact for questions");
  });

  it("is limited to staff roles and handles an unknown student", () => {
    expect(canUsePwn("case_manager")).toBe(true);
    expect(canUsePwn("paraprofessional")).toBe(false);
    expect(draw("nobody")).toContain("Student not found.");
    setRole("paraprofessional");
    expect(draw()).toContain("Not available for this role");
  });
});
