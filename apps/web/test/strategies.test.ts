import { describe, expect, it } from "vitest";
import { GRADE_BANDS } from "../src/data/library.ts";
import { strategies, strategyById } from "../src/data/strategies.ts";
import { filterStrategies, noStrategyFilter, strategyAreas } from "../src/data/strategyFilter.ts";

describe("sample strategies", () => {
  it("have unique ids and complete content", () => {
    expect(new Set(strategies.map((x) => x.id)).size).toBe(strategies.length);
    for (const x of strategies) {
      expect(x.title.trim()).not.toBe("");
      expect(x.description.trim()).not.toBe("");
      expect(x.steps.length).toBeGreaterThan(0);
      expect(x.watch_for.trim()).not.toBe("");
      expect(x.grade_bands.length).toBeGreaterThan(0);
      for (const b of x.grade_bands) expect(GRADE_BANDS).toContain(b);
    }
  });
  it("cover all three tiers and all three UDL groups", () => {
    expect(new Set(strategies.map((x) => x.tier))).toEqual(new Set([1, 2, 3]));
    expect(new Set(strategies.map((x) => x.udl)).size).toBe(3);
  });
  it("are found by id", () => {
    expect(strategyById("s-echo")?.title).toMatch(/echo/i);
    expect(strategyById("nope")).toBeUndefined();
  });
});

describe("filterStrategies", () => {
  it("returns all with no filter", () => {
    expect(filterStrategies(strategies, noStrategyFilter)).toHaveLength(strategies.length);
  });
  it("filters by tier, UDL group, area and grade band together", () => {
    const t3 = filterStrategies(strategies, { ...noStrategyFilter, tier: "3" });
    expect(t3.length).toBeGreaterThan(0);
    expect(t3.every((x) => x.tier === 3)).toBe(true);
    const both = filterStrategies(strategies, {
      ...noStrategyFilter,
      udl: "engagement",
      area: "behavior",
      band: "K-2",
    });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((x) => x.udl === "engagement" && x.area === "behavior")).toBe(true);
    expect(both.every((x) => x.grade_bands.includes("K-2"))).toBe(true);
  });
  it("searches titles, steps and the tier wording at the start of words", () => {
    expect(filterStrategies(strategies, { ...noStrategyFilter, query: "break card" })[0]?.id).toBe(
      "s-break-card",
    );
    const found = filterStrategies(strategies, { ...noStrategyFilter, query: "one to one" });
    for (const x of strategies.filter((y) => y.tier === 3)) expect(found).toContain(x);
    expect(filterStrategies(strategies, { ...noStrategyFilter, query: "ounting" })).toHaveLength(0);
  });
  it("limits to a set of ids and returns nothing for an empty set", () => {
    const only = new Set(["s-echo", "s-wait-time"]);
    expect(filterStrategies(strategies, { ...noStrategyFilter, only })).toHaveLength(2);
    expect(filterStrategies(strategies, { ...noStrategyFilter, only: new Set() })).toHaveLength(0);
  });
  it("lists each area once, sorted", () => {
    const a = strategyAreas(strategies);
    expect(a).toEqual([...new Set(a)].sort((x, y) => x.localeCompare(y)));
    expect(a).toContain("transition");
  });
});
