import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateDistrict } from "../src/generate.ts";
import {
  isFiled,
  nextSchoolDay,
  nextState,
  progressReportStatus,
  waitingLabel,
} from "../src/progress-reports.ts";
import type { ProgressReportState, SchoolCalendar } from "../src/types.ts";

interface Vectors {
  calendar: SchoolCalendar;
  state_labels: Record<ProgressReportState, string | null>;
  next_school_day_cases: { name: string; after: string; next: string }[];
  cases: {
    name: string;
    state: ProgressReportState;
    due_date: string;
    today: string;
    first_overdue_day: string;
    overdue: boolean;
    days_overdue: number;
  }[];
}

// The Swift copy of the rule (CoreModels ProgressReportRules) loads this same file.
const v = JSON.parse(
  readFileSync(new URL("../vectors/progress-reports.json", import.meta.url), "utf8"),
) as Vectors;
const calendar: SchoolCalendar = {
  school_year: v.calendar.school_year,
  no_school_days: v.calendar.no_school_days,
};

describe("progress report overdue vectors", () => {
  it.each(v.cases)("$name", (c) => {
    expect(progressReportStatus(c, c.today, calendar)).toEqual({
      filed: c.state === "filed_attested" || c.state === "verified_by_pdf",
      first_overdue_day: c.first_overdue_day,
      overdue: c.overdue,
      days_overdue: c.days_overdue,
    });
  });

  it.each(v.next_school_day_cases)("next school day: $name", ({ after, next }) => {
    expect(nextSchoolDay(after, calendar)).toBe(next);
  });

  it("uses the words the screens show", () => {
    for (const [state, label] of Object.entries(v.state_labels)) {
      expect(waitingLabel(state as ProgressReportState)).toBe(label);
    }
  });

  it("moves through the states in order and stops after the PDF check", () => {
    expect(nextState("not_started")).toBe("drafted");
    expect(nextState("copied")).toBe("filed_attested");
    expect(nextState("verified_by_pdf")).toBeNull();
    expect(isFiled("copied")).toBe(false);
    expect(isFiled("filed_attested")).toBe(true);
  });
});

describe("demo progress reports", () => {
  const district = generateDistrict();
  const waiting = district.progress_reports.filter((r) => !isFiled(r.state));

  it("has 12 Q1 reports, 6 filed and 6 waiting, one per student, in both buildings", () => {
    expect(district.progress_reports).toHaveLength(12);
    expect(waiting).toHaveLength(6);
    const buildings = new Set(
      waiting.map((r) => {
        const iep = district.ieps.find((i) => i.id === r.iep_id)!;
        return district.students.find((s) => s.id === iep.student_id)!.school_id;
      }),
    );
    expect(buildings.size).toBe(2);
    expect(new Set(district.progress_reports.map((r) => r.iep_id)).size).toBe(12);
  });

  it("shows all six waiting reports overdue on the phone demo day and on Nov 16", () => {
    for (const today of ["2026-10-30", "2026-11-16"]) {
      const overdue = district.progress_reports.filter(
        (r) => progressReportStatus(r, today, district.school_calendar).overdue,
      );
      expect(overdue.map((r) => r.id).sort()).toEqual(waiting.map((r) => r.id).sort());
    }
  });

  it("covers every waiting state and has no overdue report before the due date passes", () => {
    expect(new Set(waiting.map((r) => r.state))).toEqual(
      new Set(["not_started", "drafted", "approved", "copied"]),
    );
    expect(
      district.progress_reports.some(
        (r) => progressReportStatus(r, "2026-10-23", district.school_calendar).overdue,
      ),
    ).toBe(false);
  });

  it("filed reports say who filed and when; waiting ones do not", () => {
    for (const r of district.progress_reports) {
      expect(r.filed_attested_by !== null).toBe(isFiled(r.state));
      expect(r.filed_attested_at !== null).toBe(isFiled(r.state));
    }
  });
});
