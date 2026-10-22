import { describe, expect, it } from "vitest";
import { goals } from "../src/data/library.ts";
import { fillFrom, fitsGrade, goalInput, gradeBandOf, oneTap } from "../src/data/libraryFill.ts";
import { renderedText } from "../src/data/libraryText.ts";

const TODAY = "2026-10-21";
const facts = { name: "Sam", grade: "2", planEnds: "2027-05-20" };
const goal = (id: string) => goals.find((g) => g.id === id)!;

describe("gradeBandOf", () => {
  it("maps grades to library bands", () => {
    expect(gradeBandOf("PK")).toBe("EC");
    expect(gradeBandOf("K")).toBe("K-2");
    expect(gradeBandOf("2")).toBe("K-2");
    expect(gradeBandOf("3")).toBe("3-5");
    expect(gradeBandOf("8")).toBe("6-8");
    expect(gradeBandOf("12")).toBe("9-12");
    expect(gradeBandOf("13")).toBeNull();
    expect(gradeBandOf("")).toBeNull();
    expect(gradeBandOf("second")).toBeNull();
  });
  it("says whether a goal fits, or null when the grade is unknown", () => {
    expect(fitsGrade(goal("g-cvc"), "1")).toBe(true);
    expect(fitsGrade(goal("g-cvc"), "7")).toBe(false);
    expect(fitsGrade(goal("g-cvc"), "")).toBeNull();
  });
});

describe("fillFrom", () => {
  it("uses the end of the plan year for the date", () => {
    expect(fillFrom(goal("g-addition"), facts, TODAY)["date"]).toBe("2027-05-20");
  });
  it("leaves the date empty when the plan year has ended or is missing", () => {
    expect(fillFrom(goal("g-addition"), { ...facts, planEnds: "2026-05-20" }, TODAY)["date"]).toBe(
      undefined,
    );
    expect(fillFrom(goal("g-addition"), { ...facts, planEnds: "" }, TODAY)["date"]).toBe(undefined);
    expect(fillFrom(goal("g-addition"), { ...facts, planEnds: "soon" }, TODAY)["date"]).toBe(
      undefined,
    );
  });
  it("keeps the library default choices", () => {
    expect(fillFrom(goal("g-addition"), facts, TODAY)["limit"]).toBe("20");
  });
});

describe("oneTap", () => {
  it("is true when only a date was missing", () => {
    expect(oneTap(goal("g-addition"), fillFrom(goal("g-addition"), facts, TODAY), TODAY)).toBe(
      true,
    );
  });
  it("is false when a blank needs the teacher", () => {
    const g = goal("g-fluency");
    expect(oneTap(g, fillFrom(g, facts, TODAY), TODAY)).toBe(false);
  });
  it("is false for behavior goals that need the plan confirmation", () => {
    const g = goal("g-onTask");
    expect(g.requires_fba_bip).toBe(true);
    expect(oneTap(g, { ...fillFrom(g, facts, TODAY), minutes: "5" }, TODAY)).toBe(false);
  });
  it("is false without a plan end date", () => {
    const g = goal("g-addition");
    expect(oneTap(g, fillFrom(g, { ...facts, planEnds: "" }, TODAY), TODAY)).toBe(false);
  });
});

describe("goalInput", () => {
  it("writes the wording with the student's name and the typed target", () => {
    const g = goal("g-fluency");
    const values = { ...fillFrom(g, facts, TODAY), target_wcpm: "90" };
    const input = goalInput(g, values, "Sam");
    expect(input.statement).toBe(renderedText(g, values, "Sam"));
    expect(input.statement).toContain("Sam");
    expect(input.targetValue).toBe(90);
    expect(input.criteria).toContain("90");
  });
  it("uses the fixed target for a goal without a typed one", () => {
    const g = goal("g-addition");
    expect(goalInput(g, fillFrom(g, facts, TODAY), "Sam").targetValue).toBe(80);
  });
});
