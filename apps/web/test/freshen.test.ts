import { describe, expect, it } from "vitest";
import { data_points } from "@synthetic/fixtures/demo-district.json";
import { freshened, weeksToShift } from "../src/data/freshen.ts";
import { getWorkspace, loadSample, loadSampleAsOf } from "../src/data/workspace.ts";

const newest = (pts: { observed_at: string }[]) =>
  pts.reduce((a, p) => (p.observed_at > a ? p.observed_at : a), "");
const day = (iso: string) => iso.slice(0, 10);

describe("weeksToShift", () => {
  it("counts whole weeks so the newest session is yesterday or earlier", () => {
    expect(weeksToShift("2026-10-15T15:00:00Z", "2026-10-30")).toBe(2);
    expect(weeksToShift("2026-10-15T15:00:00Z", "2026-11-16")).toBe(4);
    expect(weeksToShift("2026-10-15T15:00:00Z", "2026-10-22")).toBe(0);
    expect(weeksToShift("2026-10-15T15:00:00Z", "2026-10-23")).toBe(1);
  });
  it("never moves sessions backwards and ignores a bad date", () => {
    expect(weeksToShift("2026-10-15T15:00:00Z", "2026-09-01")).toBe(0);
    expect(weeksToShift("2026-10-15T15:00:00Z", "soon")).toBe(0);
    expect(weeksToShift("", "2026-10-30")).toBe(0);
  });
});

describe("freshened", () => {
  it("moves every session by the same whole weeks and keeps the weekday", () => {
    const moved = freshened(data_points, "2026-11-16");
    expect(moved).toHaveLength(data_points.length);
    expect(day(newest(moved))).toBe("2026-11-12");
    moved.forEach((p, i) => {
      const was = data_points[i]!;
      const ms = Date.parse(p.observed_at) - Date.parse(was.observed_at);
      expect(ms).toBe(28 * 86_400_000);
      expect(new Date(p.observed_at).getUTCDay()).toBe(new Date(was.observed_at).getUTCDay());
      expect(Date.parse(p.client_created_at) - Date.parse(was.client_created_at)).toBe(ms);
      expect(p.id).toBe(was.id);
    });
  });
  it("lands the newest session within a week of the Oct 30 demo", () => {
    const d = day(newest(freshened(data_points, "2026-10-30")));
    expect(d <= "2026-10-29" && d >= "2026-10-23").toBe(true);
  });
  it("returns the originals when nothing needs to move", () => {
    expect(freshened(data_points, "2026-10-16")).toBe(data_points);
  });
});

describe("loading the sample", () => {
  it("loadSample keeps the fixed sessions and loadSampleAsOf moves them", () => {
    loadSample();
    const fixed = day(newest(getWorkspace().points));
    loadSampleAsOf("2026-11-16");
    expect(day(newest(getWorkspace().points))).toBe("2026-11-12");
    expect(fixed).toBe("2026-10-15");
  });
});
