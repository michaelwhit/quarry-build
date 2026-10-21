import type { ProgressReport, ProgressReportState, SchoolCalendar } from "./types.ts";

// The one reading of "overdue" for progress reports. The Swift app has its own copy in CoreModels
// (ProgressReportRules); both are checked against vectors/progress-reports.json, so a change here
// is a change to that file and to the Swift copy.

const DAY_MS = 86_400_000;
const dayNumber = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const PROGRESS_REPORT_STATES: readonly ProgressReportState[] = [
  "not_started",
  "drafted",
  "approved",
  "copied",
  "filed_attested",
  "verified_by_pdf",
];

/** Filed reports are done; they never count as overdue and never show on the overdue view. */
export function isFiled(state: ProgressReportState): boolean {
  return state === "filed_attested" || state === "verified_by_pdf";
}

/** The next state in order, or null once the report is checked against the SRS PDF. */
export function nextState(state: ProgressReportState): ProgressReportState | null {
  return PROGRESS_REPORT_STATES[PROGRESS_REPORT_STATES.indexOf(state) + 1] ?? null;
}

/** Where a waiting report stands, in the words the screens use. Null once it is filed. */
export function waitingLabel(state: ProgressReportState): string | null {
  switch (state) {
    case "not_started":
      return "Not started";
    case "drafted":
      return "Draft saved";
    case "approved":
      return "Approved, ready to copy";
    case "copied":
      return "Copied, not yet marked filed";
    default:
      return null;
  }
}

export function isSchoolDay(iso: string, calendar: SchoolCalendar): boolean {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !calendar.no_school_days.includes(iso);
}

/** The first school day strictly after `iso`. */
export function nextSchoolDay(iso: string, calendar: SchoolCalendar): string {
  let n = dayNumber(iso) + 1;
  while (!isSchoolDay(isoOf(n), calendar)) n++;
  return isoOf(n);
}

export interface ProgressReportStatus {
  filed: boolean;
  /** The first school day after the due date. A report is not overdue before this day. */
  first_overdue_day: string;
  overdue: boolean;
  /** School days from the first overdue day through `today`, counting both; 0 when not overdue. */
  days_overdue: number;
}

/**
 * A report is overdue when it is not filed and `today` is on or after the first school day after
 * its due date. Weekends, breaks and staff days are never late days. Overdue describes the
 * report, never a person.
 */
export function progressReportStatus(
  report: Pick<ProgressReport, "state" | "due_date">,
  today: string,
  calendar: SchoolCalendar,
): ProgressReportStatus {
  const first = nextSchoolDay(report.due_date, calendar);
  const filed = isFiled(report.state);
  let days = 0;
  if (!filed) {
    for (let n = dayNumber(first); n <= dayNumber(today); n++) {
      if (isSchoolDay(isoOf(n), calendar)) days++;
    }
  }
  return { filed, first_overdue_day: first, overdue: days > 0, days_overdue: days };
}
