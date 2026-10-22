import { describe, expect, it } from "vitest";
import { accommodations, goals } from "../src/data/library.ts";
import {
  categoriesOf,
  filterAccommodations,
  filterGoals,
  matchesQuery,
} from "../src/data/libraryFilter.ts";

const none = { query: "", band: "", area: "" };

describe("matchesQuery", () => {
  it("matches every typed word at the start of a word, in any order", () => {
    expect(matchesQuery("Read a grade-level passage", "pass read")).toBe(true);
    expect(matchesQuery("Read a grade-level passage", "read-aloud")).toBe(false);
    expect(matchesQuery("Directions read aloud", "Read-Aloud")).toBe(true);
  });
  it("does not match the middle of a word", () => {
    expect(matchesQuery("Calculator", "cul")).toBe(false);
  });
  it("an empty or punctuation-only search matches everything", () => {
    expect(matchesQuery("anything", "")).toBe(true);
    expect(matchesQuery("anything", " ,. ")).toBe(true);
  });
});

describe("filterGoals", () => {
  it("returns all with no filter", () => {
    expect(filterGoals(goals, none)).toHaveLength(goals.length);
  });
  it("filters by area and grade band", () => {
    const math = filterGoals(goals, { ...none, area: "math" });
    expect(math.length).toBeGreaterThan(0);
    expect(math.every((g) => g.area === "math")).toBe(true);
    const hs = filterGoals(goals, { ...none, band: "9-12" });
    expect(hs.length).toBeGreaterThan(0);
    expect(hs.every((g) => g.grade_bands.includes("9-12"))).toBe(true);
    const both = filterGoals(goals, { query: "", band: "K-2", area: "math" });
    expect(both.every((g) => g.area === "math" && g.grade_bands.includes("K-2"))).toBe(true);
  });
  it("finds a goal by words in its steps or behavior, not only the title", () => {
    expect(filterGoals(goals, { ...none, query: "scissors" }).map((g) => g.id)).toContain(
      "g-scissors",
    );
    expect(filterGoals(goals, { ...none, query: "capital" }).map((g) => g.id)).toContain(
      "g-sentence",
    );
    expect(filterGoals(goals, { ...none, query: "zzzz" })).toEqual([]);
  });
});

describe("filterAccommodations", () => {
  const f = { query: "", kind: "", category: "" };
  it("filters by type and category", () => {
    const tests = filterAccommodations(accommodations, { ...f, kind: "testing_accommodation" });
    expect(tests.length).toBeGreaterThan(0);
    expect(tests.every((a) => a.kind === "testing_accommodation")).toBe(true);
    for (const c of categoriesOf(accommodations))
      expect(filterAccommodations(accommodations, { ...f, category: c }).length).toBeGreaterThan(0);
  });
  it("searches the description", () => {
    expect(filterAccommodations(accommodations, { ...f, query: "calculator" })).not.toHaveLength(0);
  });
  it("lists categories once, sorted", () => {
    const c = categoriesOf(accommodations);
    expect(new Set(c).size).toBe(c.length);
    expect([...c].sort((a, b) => a.localeCompare(b))).toEqual(c);
  });
});
