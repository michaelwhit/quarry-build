import { describe, expect, it } from "vitest";
import { progressFor, seriesFor, worstStatus } from "../src/data/derive.ts";
import { trendLine } from "../src/ui/Graph.tsx";
import { dataTotals, students } from "../src/data/district.ts";

const plan = { target_value: 10 };
const mk = (vals: number[]) =>
  vals.map((value, i) => ({ at: `2026-09-${String(i + 1).padStart(2, "0")}T12:00:00Z`, value }));

describe("progressFor", () => {
  it("reports no data for an empty series", () => {
    expect(progressFor([], plan, "2026-08-01", "2027-08-01").status).toBe("no_data");
  });
  it("marks the target met when the recent mean reaches it", () => {
    expect(progressFor(mk([3, 5, 9, 10, 10, 11]), plan, "2026-08-01", "2027-08-01").status).toBe(
      "met",
    );
  });
  it("flags a flat line late in the year as needing attention", () => {
    const s = progressFor(mk([3, 3, 3, 3, 3, 3]), plan, "2026-08-01", "2026-10-01");
    expect(s.status).toBe("needs_attention");
  });
  it("calls early, rising data on track", () => {
    const s = progressFor(mk([3, 4, 4, 5, 5, 6]), plan, "2026-08-01", "2027-08-01");
    expect(s.status).toBe("on_track");
  });
});

describe("seriesFor", () => {
  it("sorts by time and uses correct when value_num is null", () => {
    const base: Record<string, unknown> = { value_num: null, correct: null };
    const out = seriesFor([
      { ...base, observed_at: "2026-09-02T00:00:00Z", correct: 6 },
      { ...base, observed_at: "2026-09-01T00:00:00Z", value_num: 4 },
    ] as never);
    expect(out.map((p) => p.value)).toEqual([4, 6]);
  });
});

describe("worstStatus", () => {
  it("orders needs_attention first", () => {
    expect(worstStatus(["met", "needs_attention", "on_track"])).toBe("needs_attention");
  });
});

describe("fake district", () => {
  it("is the 12 fake students with goals and data", () => {
    expect(dataTotals.students).toBe(12);
    expect(dataTotals.goals).toBeGreaterThan(20);
    expect(students.every((s) => s.goals.every((g) => g.series.length > 0))).toBe(true);
  });
});

describe("trendLine", () => {
  it("needs three points", () => {
    expect(trendLine(mk([1, 2]))).toBeUndefined();
  });
  it("fits a rising line through rising data", () => {
    const t = trendLine(mk([1, 2, 3, 4, 5]));
    expect(t?.start).toBeCloseTo(1);
    expect(t?.end).toBeCloseTo(5);
  });
});
