import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { setRole } from "../src/data/roles.ts";
import { boxItem } from "../src/data/placementItems.ts";
import { loadSample } from "../src/data/workspace.ts";

setRole("sped_director");

const first = () => students[0]!.student;

describe("boxItem", () => {
  beforeEach(() => {
    loadSample();
  });
  it("blocks an empty or blank box with a plain reason", () => {
    for (const raw of ["", "   ", "\n\t"]) {
      const item = boxItem("b1", "Placement", raw, first().id);
      expect(item).toEqual({ id: "b1", label: "Placement", blocked: "Nothing written yet." });
    }
  });
  it("trims the text and keeps the id and label", () => {
    expect(boxItem("b2", "Reason", "  learns in class \n", first().id)).toEqual({
      id: "b2",
      label: "Reason",
      text: "learns in class",
    });
  });
  it("removes the student's last name, whatever the case", () => {
    const s = first();
    const raw = `${s.first_name} ${s.last_name.toUpperCase()} learns in class`;
    const item = boxItem("b3", "Reason", raw, s.id);
    expect(item.text?.toLowerCase()).not.toContain(s.last_name.toLowerCase());
    expect(item.text).toContain(s.first_name);
  });
  it("keeps the text as written when the student is not found", () => {
    expect(boxItem("b4", "Reason", " no such student ", "missing").text).toBe("no such student");
  });
  it("is blocked, not scrubbed to nothing, when the box holds only the last name", () => {
    const s = first();
    expect(boxItem("b5", "Reason", s.last_name, s.id).blocked).toBe("Nothing written yet.");
  });
});
