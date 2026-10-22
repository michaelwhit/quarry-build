import {
  caseload_assignments,
  data_points,
  goals,
  ieps,
  school_calendar,
  schools,
  staff,
  students,
} from "@synthetic/fixtures/demo-district.json";
import { isSchoolDay, progressReportStatus } from "@synthetic/src/progress-reports.ts";
import type { SchoolCalendar } from "@synthetic/src/types.ts";
import { freshened } from "./freshen.ts";
import { REPORTS, canSeeOverdue, currentState, isoToday } from "./overdue.ts";
import { getRole, subscribeRole } from "./roles.ts";

// The director's "What's due" view: for each case manager, the reports and IEP dates that are
// overdue or coming up, and the students whose data has not been recorded lately. Read only, made-up
// data, nothing leaves the browser. Overdue and "needs data" describe a record, never a person, and
// the people are listed by name, not ranked or scored.

/** How many school days without a recorded data point before a goal is listed. */
export const DATA_GAP_SCHOOL_DAYS = 5;

/** How far ahead "coming up" looks, in days. The first is the screen's default. */
export const WINDOWS = [180, 90, 60, 30] as const;
export type WindowDays = (typeof WINDOWS)[number];

const calendar = school_calendar as SchoolCalendar;

const DAY = 86_400_000;
const dayNumber = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string => isoOf(dayNumber(iso) + n);

/** School days after `from` up to and including `to`; 0 when `to` is not after `from`. */
export function schoolDaysSince(from: string, to: string): number {
  let days = 0;
  for (let n = dayNumber(from) + 1; n <= dayNumber(to); n++)
    if (isSchoolDay(isoOf(n), calendar)) days++;
  return days;
}

export type DueKind = "report" | "annual_review" | "reevaluation";

export interface DueItem {
  id: string;
  studentId: string;
  /** First name and last initial only. */
  student: string;
  kind: DueKind;
  /** What it is, in plain words: "Quarter 1 progress report". */
  what: string;
  dueDate: string;
  /** True when the date has passed (reports: the first school day after it has come). */
  overdue: boolean;
}

export interface DataGap {
  studentId: string;
  student: string;
  /** Goals with no data point in the last DATA_GAP_SCHOOL_DAYS school days. */
  goalsWithoutData: number;
  goalsTotal: number;
  /** The date of the newest data point on any of the student's goals, or null if none. */
  lastRecorded: string | null;
}

export interface CaseManagerDue {
  caseManager: string;
  /** Every building where the case manager has students on the caseload, sorted by name. */
  buildings: string[];
  overdue: DueItem[];
  comingUp: DueItem[];
  needsData: DataGap[];
}

export interface DueView {
  today: string;
  window: WindowDays;
  managers: CaseManagerDue[];
  /** Everything listed: overdue and coming-up items, plus students needing data. */
  total: number;
}

const studentById = new Map(students.map((s) => [s.id, s]));
const staffById = new Map(staff.map((s) => [s.id, s]));
const schoolById = new Map(schools.map((s) => [s.id, s]));
const shortName = (s: { first_name: string; last_name: string }) =>
  `${s.first_name} ${s.last_name.charAt(0)}.`;

/** The case manager each student is on the caseload of, today. */
function holders(today: string): Map<string, string> {
  const held = new Map<string, string>();
  for (const a of caseload_assignments) {
    const ends = a.end_date as string | null; // the sample has none; real ones do
    if (a.relationship === "caseload" && a.start_date <= today && (ends === null || ends >= today))
      held.set(a.student_id, a.staff_id);
  }
  return held;
}

// The sample loader moves the made-up sessions forward so the newest is recent (see freshen.ts).
// Data to record uses the same moved sessions, measured from the day the app is opened, so this
// screen and the student pages agree. Moving the practice date forward still shows gaps.
let sampleAnchor: string | null = null;
/** For tests: pin the day the sample sessions are moved up to; null goes back to today. */
export const setSampleAnchor = (iso: string | null): void => {
  sampleAnchor = iso;
};

const lastPointByGoal = (openedOn: string): Map<string, string> => {
  const last = new Map<string, string>();
  for (const p of freshened(data_points, openedOn)) {
    const day = p.observed_at.slice(0, 10);
    if (day > (last.get(p.goal_id) ?? "")) last.set(p.goal_id, day);
  }
  return last;
};

/** Which reports and IEP dates are due, and whose data has gaps, as of `today`. */
export function dueView(
  today: string,
  window: WindowDays = WINDOWS[0],
  openedOn: string = sampleAnchor ?? isoToday(),
): DueView {
  const held = holders(today);
  const until = addDays(today, window);
  const rows = new Map<string, CaseManagerDue>();
  const rowFor = (studentId: string): CaseManagerDue | null => {
    const manager = staffById.get(held.get(studentId) ?? "");
    const student = studentById.get(studentId);
    if (!manager || !student) return null;
    let row = rows.get(manager.id);
    if (!row) {
      const names = new Set<string>();
      for (const [studentId, staffId] of held) {
        const school = schoolById.get(studentById.get(studentId)?.school_id ?? "");
        if (staffId === manager.id && school) names.add(school.name.replace(" (synthetic)", ""));
      }
      row = {
        caseManager: manager.display_name,
        buildings: [...names].sort(),
        overdue: [],
        comingUp: [],
        needsData: [],
      };
      rows.set(manager.id, row);
    }
    return row;
  };

  for (const r of REPORTS) {
    const row = rowFor(r.studentId);
    const state = currentState(r);
    const status = progressReportStatus({ state, due_date: r.dueDate }, today, calendar);
    if (!row || status.filed) continue;
    const item: DueItem = {
      id: r.id,
      studentId: r.studentId,
      student: r.student,
      kind: "report",
      what: `${r.periodLabel} progress report`,
      dueDate: r.dueDate,
      overdue: false,
    };
    if (status.overdue) row.overdue.push({ ...item, overdue: true });
    else if (r.dueDate <= until) row.comingUp.push(item);
  }

  for (const iep of ieps) {
    const student = studentById.get(iep.student_id);
    const row = student && rowFor(student.id);
    if (!student || !row) continue;
    const dates: [DueKind, string, string][] = [
      ["annual_review", "Annual IEP review", iep.annual_review_due],
      ["reevaluation", "Reevaluation", iep.reevaluation_due],
    ];
    for (const [kind, what, dueDate] of dates) {
      if (dueDate > until) continue;
      const item: DueItem = {
        id: `${iep.id}:${kind}`,
        studentId: student.id,
        student: shortName(student),
        kind,
        what,
        dueDate,
        overdue: dueDate < today,
      };
      (item.overdue ? row.overdue : row.comingUp).push(item);
    }
  }

  const last = lastPointByGoal(openedOn);
  for (const iep of ieps) {
    const student = studentById.get(iep.student_id);
    const row = student && rowFor(student.id);
    if (!student || !row) continue;
    const mine = goals.filter((g) => g.iep_id === iep.id);
    const stale = mine.filter((g) => {
      const at = last.get(g.id);
      return !at || schoolDaysSince(at, today) > DATA_GAP_SCHOOL_DAYS;
    });
    if (stale.length === 0) continue;
    const newest =
      mine
        .map((g) => last.get(g.id) ?? "")
        .sort()
        .at(-1) || null;
    row.needsData.push({
      studentId: student.id,
      student: shortName(student),
      goalsWithoutData: stale.length,
      goalsTotal: mine.length,
      lastRecorded: newest,
    });
  }

  const byDate = (a: DueItem, b: DueItem) =>
    a.dueDate.localeCompare(b.dueDate) || a.student.localeCompare(b.student);
  const managers = [...rows.values()]
    .map((m) => ({
      ...m,
      overdue: m.overdue.sort(byDate),
      comingUp: m.comingUp.sort(byDate),
      needsData: m.needsData.sort((a, b) => a.student.localeCompare(b.student)),
    }))
    .filter((m) => m.overdue.length + m.comingUp.length + m.needsData.length > 0)
    .sort((a, b) => a.caseManager.localeCompare(b.caseManager));
  const total = managers.reduce(
    (n, m) => n + m.overdue.length + m.comingUp.length + m.needsData.length,
    0,
  );
  return { today, window, managers, total };
}

// What the view held in memory: one audit row per load (counts and ids only). Cleared when the
// role changes or the person signs out.
export interface DueAuditRow {
  action: "due_view_load";
  count: number;
  itemIds: string[];
  studentIds: string[];
}
export const dueAuditRows: DueAuditRow[] = [];

export function recordDueLoad(view: DueView): void {
  dueAuditRows.push({
    action: "due_view_load",
    count: view.total,
    itemIds: view.managers.flatMap((m) => [...m.overdue, ...m.comingUp].map((i) => i.id)),
    studentIds: view.managers.flatMap((m) => m.needsData.map((d) => d.studentId)),
  });
}
export const clearDue = (): void => {
  dueAuditRows.length = 0;
};
subscribeRole(() => {
  if (!canSeeOverdue(getRole())) clearDue();
});
