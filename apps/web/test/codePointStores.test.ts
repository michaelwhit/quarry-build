import { beforeEach, describe, expect, it } from "vitest";
import { count } from "../src/data/codePoints.ts";
import {
  getPlacement,
  resetPlacementForTests,
  setPlacement,
  usePlacementStorage,
} from "../src/data/placement.ts";
import { getPwnEntry, resetPwnForTests, setPwnEntry, usePwnStorage } from "../src/data/pwnStore.ts";
import {
  getGoalExtras,
  resetGoalExtrasForTests,
  updateGoalExtras,
  useGoalExtrasStorage,
} from "../src/data/goalExtras.ts";

const SMILE = "\u{1F600}"; // one code point, two UTF-16 units
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

beforeEach(() => {
  usePlacementStorage(mem());
  resetPlacementForTests();
  usePwnStorage(mem());
  resetPwnForTests();
  useGoalExtrasStorage(mem());
  resetGoalExtrasForTests();
});

describe("saved practice text is cut by code points", () => {
  it("placement boxes keep 4000 emoji and cut a longer one at 4000 whole emoji", () => {
    setPlacement("s1", { lre: SMILE.repeat(4000), health: SMILE.repeat(4100) });
    expect(count(getPlacement("s1").lre)).toBe(4000);
    expect(count(getPlacement("s1").health)).toBe(4000);
    expect(getPlacement("s1").health).not.toMatch(LONE);
  });
  it("Prior Written Notice text keeps 1000 emoji and cuts at 1000 whole emoji", () => {
    setPwnEntry("s1", { reasons: [SMILE.repeat(1000), SMILE.repeat(1100)] });
    const [a, b] = getPwnEntry("s1").reasons;
    expect(count(a ?? "")).toBe(1000);
    expect(count(b ?? "")).toBe(1000);
    expect(b).not.toMatch(LONE);
  });
  it("goal extras cut a long person-responsible line at a whole emoji", () => {
    updateGoalExtras("g1", (r) => ({ ...r, responsible: SMILE.repeat(5000) }));
    const saved = getGoalExtras("g1").responsible;
    expect(saved).not.toMatch(LONE);
    expect(count(saved)).toBeLessThanOrEqual(1000);
    expect(count(saved)).toBeGreaterThan(0);
  });
});
