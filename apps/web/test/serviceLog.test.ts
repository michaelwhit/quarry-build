import { describe, expect, it } from "vitest";
import {
  MAX_ENTRY_MINUTES,
  addEntry,
  entryProblem,
  removeEntry,
  summarizeRange,
  summarizeWeek,
  weekLine,
  weekStart,
  type LogEntry,
  type Outcome,
} from "../src/data/serviceLog.ts";

const e = (
  id: string,
  date: string,
  minutes: number,
  outcome: Outcome = "delivered",
): LogEntry => ({
  id,
  date,
  minutes,
  outcome,
});

describe("week start", () => {
  it("finds the Monday on or before a date", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStart("2026-10-22")).toBe("2026-10-19"); // Thursday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });
  it("crosses month and year ends", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
  it("rejects dates that are not real", () => {
    for (const bad of ["", "2026-02-31", "2026-13-01", "10/22/2026", "2026-1-5"])
      expect(weekStart(bad)).toBeNull();
  });
});

describe("entry checks", () => {
  it("accepts a normal entry", () => {
    expect(entryProblem(e("a", "2026-10-20", 30))).toBeNull();
    expect(entryProblem(e("a", "2026-10-20", MAX_ENTRY_MINUTES))).toBeNull();
  });
  it("refuses bad minutes, dates, ids and outcomes", () => {
    expect(entryProblem(e("a", "2026-10-20", 0))).toMatch(/at least 1/);
    expect(entryProblem(e("a", "2026-10-20", 12.5))).toMatch(/whole number/);
    expect(entryProblem(e("a", "2026-10-20", Number.NaN))).toMatch(/whole number/);
    expect(entryProblem(e("a", "2026-10-20", MAX_ENTRY_MINUTES + 1))).toMatch(/cannot be more/);
    expect(entryProblem(e("a", "2026-02-30", 30))).toMatch(/real date/);
    expect(entryProblem(e("  ", "2026-10-20", 30))).toMatch(/id/);
    expect(entryProblem({ ...e("a", "2026-10-20", 30), outcome: "late" as Outcome })).toMatch(
      /what happened/,
    );
  });
  it("adds without changing the old list, and skips invalid or repeated ids", () => {
    const base = [e("a", "2026-10-20", 30)];
    const next = addEntry(base, e("b", "2026-10-21", 30));
    expect(next.map((x) => x.id)).toEqual(["a", "b"]);
    expect(base).toHaveLength(1);
    expect(addEntry(next, e("b", "2026-10-22", 15))).toEqual(next);
    expect(addEntry(next, e("c", "2026-10-22", 0))).toEqual(next);
  });
  it("removes by id", () => {
    expect(
      removeEntry([e("a", "2026-10-20", 30), e("b", "2026-10-21", 30)], "a").map((x) => x.id),
    ).toEqual(["b"]);
    expect(removeEntry([], "a")).toEqual([]);
  });
});

describe("week summary", () => {
  const week = [
    e("1", "2026-10-19", 30),
    e("2", "2026-10-21", 30, "provider_absent"),
    e("3", "2026-10-22", 30, "student_absent"),
    e("4", "2026-10-23", 15, "delivered"),
    e("5", "2026-10-26", 60), // next week
  ];
  it("totals each outcome for the week and ignores other weeks", () => {
    const s = summarizeWeek(week, "2026-10-24", 90)!;
    expect(s).toMatchObject({
      weekOf: "2026-10-19",
      required: 90,
      delivered: 45,
      providerAbsent: 30,
      studentAbsent: 30,
      schoolClosed: 0,
      shortfall: 45,
      makeUpOwed: 30,
    });
  });
  it("owes make-up only for minutes the provider missed", () => {
    const s = summarizeWeek([e("1", "2026-10-20", 60, "student_absent")], "2026-10-20", 60)!;
    expect(s.shortfall).toBe(60);
    expect(s.makeUpOwed).toBe(0);
  });
  it("never shows a negative shortfall when more was delivered", () => {
    const s = summarizeWeek(
      [e("1", "2026-10-20", 90), e("2", "2026-10-21", 30, "provider_absent")],
      "2026-10-20",
      60,
    )!;
    expect(s.shortfall).toBe(0);
    expect(s.makeUpOwed).toBe(0);
  });
  it("skips invalid entries and returns null for a bad week", () => {
    const s = summarizeWeek(
      [e("1", "2026-10-20", -5), e("2", "2026-10-20", 20)],
      "2026-10-20",
      60,
    )!;
    expect(s.delivered).toBe(20);
    expect(summarizeWeek(week, "nope", 90)).toBeNull();
  });
  it("treats a missing or odd requirement as zero", () => {
    expect(summarizeWeek(week, "2026-10-19", Number.NaN)!.required).toBe(0);
    expect(summarizeWeek(week, "2026-10-19", -10)!.required).toBe(0);
  });
});

describe("range and wording", () => {
  it("lists every week from the first entry to today, including empty ones", () => {
    const list = summarizeRange(
      [e("1", "2026-10-06", 30), e("2", "2026-10-21", 30)],
      "2026-10-22",
      30,
    );
    expect(list.map((w) => w.weekOf)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(list[1]!.delivered).toBe(0);
    expect(list[1]!.shortfall).toBe(30);
  });
  it("is empty with no entries, a bad date, or entries after today", () => {
    expect(summarizeRange([], "2026-10-22", 30)).toEqual([]);
    expect(summarizeRange([e("1", "2026-10-06", 30)], "bad", 30)).toEqual([]);
    expect(summarizeRange([e("1", "2026-11-06", 30)], "2026-10-22", 30)).toEqual([]);
  });
  it("describes a week in plain words", () => {
    const base = { weekOf: "2026-10-19", studentAbsent: 0, schoolClosed: 0 };
    expect(
      weekLine({
        ...base,
        required: 60,
        delivered: 60,
        providerAbsent: 0,
        shortfall: 0,
        makeUpOwed: 0,
      }),
    ).toBe("Delivered 60 of 60 minutes.");
    expect(
      weekLine({
        ...base,
        required: 90,
        delivered: 60,
        providerAbsent: 30,
        shortfall: 30,
        makeUpOwed: 30,
      }),
    ).toBe("Delivered 60 of 90 minutes; 30 short, 30 owed in make-up.");
    expect(
      weekLine({
        ...base,
        required: 90,
        delivered: 60,
        providerAbsent: 0,
        shortfall: 30,
        makeUpOwed: 0,
      }),
    ).toBe("Delivered 60 of 90 minutes; 30 short, none owed in make-up.");
  });
});
