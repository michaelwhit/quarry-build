import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { useStorage } from "../src/data/workspace.ts";
import { CaseloadEmpty, emptyCaseload } from "../src/ui/CaseloadEmpty.tsx";

beforeEach(() => useStorage(null));

describe("empty caseload", () => {
  it("offers add, import and sample to the director", () => {
    setRole("sped_director");
    const html = renderToString(createElement(CaseloadEmpty));
    expect(html).toContain("Add a student");
    expect(html).toContain("Import students");
    expect(html).toContain("Load sample students");
  });

  it("offers add and import but not sample to a case manager", () => {
    const e = emptyCaseload("case_manager");
    expect(e.add).toBe(true);
    expect(e.sample).toBe(false);
  });

  it("gives a provider and a para a plain message and no buttons", () => {
    for (const r of ["related_service_provider", "paraprofessional"] as const) {
      setRole(r);
      const html = renderToString(createElement(CaseloadEmpty));
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("<button");
      expect(html).toContain("No students");
    }
  });
});
