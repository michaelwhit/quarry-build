import { describe, expect, it } from "vitest";
import { count, gradeWords, metaLine } from "../src/data/wording.ts";

describe("count", () => {
  it("uses the singular only for exactly one", () => {
    expect(count(0, "goal")).toBe("0 goals");
    expect(count(1, "goal")).toBe("1 goal");
    expect(count(2, "goal")).toBe("2 goals");
  });
  it("takes an irregular plural", () => {
    expect(count(1, "child", "children")).toBe("1 child");
    expect(count(3, "child", "children")).toBe("3 children");
  });
});

describe("gradeWords", () => {
  it("says nothing when the grade is empty, blank or missing", () => {
    expect(gradeWords("")).toBe("");
    expect(gradeWords("  ")).toBe("");
    expect(gradeWords(undefined)).toBe("");
  });
  it("names a grade, trimmed", () => {
    expect(gradeWords("3")).toBe("Grade 3");
    expect(gradeWords(" K ")).toBe("Grade K");
  });
});

describe("metaLine", () => {
  it("skips empty parts so no dangling separator shows", () => {
    expect(metaLine("", "2 goals")).toBe("2 goals");
    expect(metaLine("Grade 3", "2 goals")).toBe("Grade 3 · 2 goals");
    expect(metaLine("", "")).toBe("");
  });
});
