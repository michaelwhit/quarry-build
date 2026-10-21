import { describe, expect, it } from "vitest";
import { pageTitle } from "../src/data/title.ts";

describe("page title", () => {
  it("uses the heading on fixed screens", () => {
    expect(pageTitle("#/today", "Today")).toBe("Today · GoalLine");
    expect(pageTitle("", "Home")).toBe("Home · GoalLine");
  });
  it("never puts a student name in the title", () => {
    for (const hash of ["#/student/s1", "#/student/s1/edit", "#/track/s1/g1", "#/glance/s1"])
      expect(pageTitle(hash, "Jordan Example")).toBe("Student · GoalLine");
  });
  it("stays plain for unknown routes", () => {
    expect(pageTitle("#/nope", "Whatever")).toBe("GoalLine");
  });
});
