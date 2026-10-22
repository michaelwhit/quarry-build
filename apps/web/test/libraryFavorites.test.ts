import { beforeEach, describe, expect, it } from "vitest";
import { accommodations, goals } from "../src/data/library.ts";
import { filterAccommodations, filterGoals } from "../src/data/libraryFilter.ts";
import {
  FAVORITES_KEY,
  emptyFavorites,
  loadFavorites,
  saveFavorites,
  toggled,
  useFavoritesStorage,
} from "../src/data/libraryFavorites.ts";

const gIds = goals.map((g) => g.id);
const aIds = accommodations.map((a) => a.id);

let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  useFavoritesStorage({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  });
});

describe("favorites storage", () => {
  it("starts empty", () => {
    const f = loadFavorites(gIds, aIds);
    expect(f.goals.size).toBe(0);
    expect(f.accommodations.size).toBe(0);
  });

  it("saves and loads goals and accommodations separately", () => {
    const f = emptyFavorites();
    f.goals.add("g-cvc");
    f.accommodations.add("a-time");
    expect(saveFavorites(f)).toBe(true);
    const back = loadFavorites(gIds, aIds);
    expect([...back.goals]).toEqual(["g-cvc"]);
    expect([...back.accommodations]).toEqual(["a-time"]);
  });

  it("drops ids the library does not have, and non-string values", () => {
    data.set(
      FAVORITES_KEY,
      JSON.stringify({
        goals: ["g-cvc", "gone", 5, null, "x".repeat(200)],
        accommodations: "a-time",
      }),
    );
    const back = loadFavorites(gIds, aIds);
    expect([...back.goals]).toEqual(["g-cvc"]);
    expect(back.accommodations.size).toBe(0);
  });

  it("treats unreadable data as empty", () => {
    for (const bad of ["{", "null", "[]", '"x"', "5"]) {
      data.set(FAVORITES_KEY, bad);
      expect(loadFavorites(gIds, aIds).goals.size).toBe(0);
    }
  });

  it("reports when the browser will not keep the stars", () => {
    useFavoritesStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
    });
    expect(saveFavorites(emptyFavorites())).toBe(false);
    useFavoritesStorage(null);
    expect(saveFavorites(emptyFavorites())).toBe(false);
    expect(loadFavorites(gIds, aIds).goals.size).toBe(0);
  });
});

describe("toggled", () => {
  it("adds and removes without changing the original", () => {
    const a = new Set(["x"]);
    const b = toggled(a, "y");
    expect([...b].sort()).toEqual(["x", "y"]);
    expect([...a]).toEqual(["x"]);
    expect([...toggled(b, "x")]).toEqual(["y"]);
  });
});

describe("favorites filter", () => {
  it("shows only starred goals and accommodations, along with the other filters", () => {
    const only = new Set(["g-cvc", "g-addition"]);
    expect(
      filterGoals(goals, { query: "", band: "", area: "", only })
        .map((g) => g.id)
        .sort(),
    ).toEqual(["g-addition", "g-cvc"]);
    expect(
      filterGoals(goals, { query: "", band: "", area: "math", only }).map((g) => g.id),
    ).toEqual(["g-addition"]);
    expect(
      filterAccommodations(accommodations, {
        query: "",
        kind: "",
        category: "",
        only: new Set(["a-time"]),
      }).map((a) => a.id),
    ).toEqual(["a-time"]);
  });
  it("an empty set shows nothing, no set shows everything", () => {
    expect(filterGoals(goals, { query: "", band: "", area: "", only: new Set() })).toEqual([]);
    expect(filterGoals(goals, { query: "", band: "", area: "" })).toHaveLength(goals.length);
  });
});
