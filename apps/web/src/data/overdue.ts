import {
  caseload_assignments,
  ieps,
  progress_reports,
  reporting_periods,
  school_calendar,
  schools,
  staff,
  students,
} from "@synthetic/fixtures/demo-district.json";
import { progressReportStatus, waitingLabel } from "@synthetic/src/progress-reports.ts";
import type { ProgressReportState, SchoolCalendar } from "@synthetic/src/types.ts";
import { storedState } from "./reports.ts";
import { getRole, subscribeRole } from "./roles.ts";

// The director's "Progress reports to file" view. Read only: it reads report states and says what
// is waiting and who to ask. The reports are the made-up ones in the shared demo district; nothing
// leaves the browser. The overdue rule is the shared one in packages/synthetic-data.

export type ReportState = ProgressReportState;

export interface SampleReport {
  id: string;
  studentId: string;
  /** First name and last initial only. */
  student: string;
  grade: string;
  building: string;
  caseManager: string;
  period: string;
  periodLabel: string;
  dueDate: string;
  state: ReportState;
}

const calendar = school_calendar as SchoolCalendar;

/** Builds the list rows from the demo district: who the student is, where, and who to ask. */
function buildReports(): SampleReport[] {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const iepById = new Map(ieps.map((i) => [i.id, i]));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const schoolById = new Map(schools.map((s) => [s.id, s]));
  const periodById = new Map(reporting_periods.map((p) => [p.id, p]));
  const manager = new Map(
    caseload_assignments.filter((a) => a.relationship === "caseload").map((a) => [a.student_id, a]),
  );
  const rank = (p: { id: string; school_id: string }) =>
    reporting_periods
      .filter((q) => q.school_id === p.school_id)
      .sort((a, b) => a.srs_report_date.localeCompare(b.srs_report_date))
      .findIndex((q) => q.id === p.id) + 1;
  return progress_reports.flatMap((r): SampleReport[] => {
    const iep = iepById.get(r.iep_id);
    const student = iep && studentById.get(iep.student_id);
    const period = periodById.get(r.reporting_period_id);
    const holder = student && manager.get(student.id);
    if (!student || !period || !holder) return [];
    return [
      {
        id: r.id,
        studentId: student.id,
        student: `${student.first_name} ${student.last_name.charAt(0)}.`,
        grade: student.grade,
        building: (schoolById.get(student.school_id)?.name ?? "").replace(" (synthetic)", ""),
        caseManager: staffById.get(holder.staff_id)?.display_name ?? "the case manager",
        // Each school has its own period record for the same quarter; the quarter is the key.
        period: `Quarter ${rank(period)}`,
        periodLabel: `Quarter ${rank(period)}`,
        dueDate: r.due_date,
        state: r.state as ReportState,
      },
    ];
  });
}

export interface WaitingReport extends SampleReport {
  words: string;
}
export interface CaseManagerGroup {
  caseManager: string;
  reports: WaitingReport[];
}
export interface BuildingGroup {
  building: string;
  managers: CaseManagerGroup[];
}
export interface OverdueList {
  total: number;
  buildings: BuildingGroup[];
  /** Periods that have something waiting, newest first. */
  periods: { id: string; label: string }[];
}

export const REPORTS: readonly SampleReport[] = buildReports();

/**
 * A report worked on in the paste kit on this browser counts with the state the kit holds (the
 * kit's "Quarter 1" is the period id "q1"); otherwise the sample state stands.
 */
export const currentState = (r: SampleReport): ReportState => {
  const n = /^Quarter (\d+)$/.exec(r.period)?.[1];
  return (n && storedState(r.studentId, `q${n}`)) || r.state;
};

const waiting = (today: string): WaitingReport[] =>
  REPORTS.map((r) => ({ ...r, state: currentState(r) }))
    .filter(
      (r) => progressReportStatus({ state: r.state, due_date: r.dueDate }, today, calendar).overdue,
    )
    .map((r) => ({ ...r, words: waitingLabel(r.state) ?? "" }));

/** How many reports are waiting past their due date, across every period (the Home number). */
export const overdueCount = (today: string): number => waiting(today).length;

/** The grouped list, filtered to one period when given. Oldest due date first, then student. */
export function overdueList(today: string, period?: string): OverdueList {
  const all = waiting(today);
  const periods: OverdueList["periods"] = [];
  for (const r of [...all].sort((a, b) => b.dueDate.localeCompare(a.dueDate)))
    if (!periods.some((p) => p.id === r.period))
      periods.push({ id: r.period, label: r.periodLabel });
  const rows = period ? all.filter((r) => r.period === period) : all;
  const buildings = new Map<string, Map<string, WaitingReport[]>>();
  for (const r of rows) {
    const b = buildings.get(r.building) ?? new Map<string, WaitingReport[]>();
    b.set(r.caseManager, [...(b.get(r.caseManager) ?? []), r]);
    buildings.set(r.building, b);
  }
  const byDue = (a: WaitingReport, b: WaitingReport) =>
    a.dueDate.localeCompare(b.dueDate) || a.student.localeCompare(b.student);
  return {
    total: rows.length,
    periods,
    buildings: [...buildings.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([building, managers]) => ({
        building,
        managers: [...managers.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([caseManager, reports]) => ({ caseManager, reports: reports.sort(byDue) })),
      })),
  };
}

/** Only the director sees this view; every other role gets the "not available" page. */
export const canSeeOverdue = (role: string | null): boolean => role === "sped_director";

// What the view held in memory: the pretend date and one audit row per list load (counts and ids
// only). Both are cleared when the role changes or the person signs out.
export interface AuditRow {
  action: "overdue_list_load";
  count: number;
  reportIds: string[];
}
export const auditRows: AuditRow[] = [];
let practiceDate: string | null = null;

export function recordListLoad(list: OverdueList): void {
  auditRows.push({
    action: "overdue_list_load",
    count: list.total,
    reportIds: list.buildings.flatMap((b) => b.managers.flatMap((m) => m.reports.map((r) => r.id))),
  });
}
export const clearOverdue = (): void => {
  auditRows.length = 0;
  practiceDate = null;
};
subscribeRole(() => {
  if (!canSeeOverdue(getRole())) clearOverdue();
});

/** The date on the clock where the person is, from local fields (not the UTC date). */
export function isoToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export const getPracticeDate = (): string | null => practiceDate;
export function setPracticeDate(iso: string | null): void {
  practiceDate = iso;
}
/** The date the view counts from: the pretend date if one is set, otherwise today. */
export const viewDate = (): string => practiceDate ?? isoToday();

/** The Home line for the director. */
export function homeLine(today: string): string {
  const n = overdueCount(today);
  return n === 0
    ? "No progress reports overdue"
    : `${n} progress report${n === 1 ? "" : "s"} overdue`;
}
