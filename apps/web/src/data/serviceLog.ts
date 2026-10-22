// Service minutes log: what a provider delivered each week against the minutes the IEP calls for.
// Pure functions over plain entries, made-up data only, nothing here reads or writes storage.
// Entries hold a date, minutes and an outcome, never a student's name. A shortfall describes the
// record, not a person, and "make-up owed" counts only minutes the school missed, not absences.

export const OUTCOMES = [
  "delivered",
  "student_absent",
  "provider_absent",
  "school_closed",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  delivered: "Session held",
  student_absent: "Student absent",
  provider_absent: "Provider absent",
  school_closed: "No school",
};

/** The longest single entry accepted, in minutes (a full school day). */
export const MAX_ENTRY_MINUTES = 480;

export interface LogEntry {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Whole minutes planned (missed outcomes) or delivered ("delivered"). */
  minutes: number;
  outcome: Outcome;
}

export interface WeekSummary {
  /** Monday of the week, ISO date. */
  weekOf: string;
  required: number;
  delivered: number;
  studentAbsent: number;
  providerAbsent: number;
  schoolClosed: number;
  /** Required minutes not yet delivered, never below zero. */
  shortfall: number;
  /** Minutes the school still owes: the shortfall, up to the minutes missed by the provider. */
  makeUpOwed: number;
}

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(iso: string): number | null {
  if (!ISO.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  // Date.parse rolls 2026-02-31 forward; reject anything that does not round-trip.
  return new Date(t).toISOString().slice(0, 10) === iso ? Math.floor(t / DAY) : null;
}

/** The Monday on or before `iso`, or null when `iso` is not a real date. */
export function weekStart(iso: string): string | null {
  const n = dayNumber(iso);
  if (n === null) return null;
  // Day 0 (1970-01-01) was a Thursday, so Monday is (n + 3) % 7 days back.
  const back = (((n + 3) % 7) + 7) % 7;
  return new Date((n - back) * DAY).toISOString().slice(0, 10);
}

/** Why an entry cannot be saved, in plain words, or null when it is fine. */
export function entryProblem(e: LogEntry): string | null {
  if (!e.id.trim()) return "Every entry needs an id.";
  if (dayNumber(e.date) === null) return "Pick a real date.";
  if (!(OUTCOMES as readonly string[]).includes(e.outcome)) return "Pick what happened.";
  if (!Number.isInteger(e.minutes) || e.minutes < 1)
    return "Minutes must be a whole number, at least 1.";
  if (e.minutes > MAX_ENTRY_MINUTES) return `Minutes cannot be more than ${MAX_ENTRY_MINUTES}.`;
  return null;
}

/** A new list with `e` added; the list is returned unchanged when the entry is invalid or its id is taken. */
export function addEntry(list: readonly LogEntry[], e: LogEntry): LogEntry[] {
  if (entryProblem(e) !== null || list.some((x) => x.id === e.id)) return [...list];
  return [...list, e];
}

/** A new list without the entry with this id. */
export function removeEntry(list: readonly LogEntry[], id: string): LogEntry[] {
  return list.filter((x) => x.id !== id);
}

/** Totals for the week containing `weekOf`, against `requiredPerWeek` minutes. Invalid entries are skipped. */
export function summarizeWeek(
  entries: readonly LogEntry[],
  weekOf: string,
  requiredPerWeek: number,
): WeekSummary | null {
  const start = weekStart(weekOf);
  if (start === null) return null;
  const required = Number.isFinite(requiredPerWeek) ? Math.max(0, Math.round(requiredPerWeek)) : 0;
  const total: Record<Outcome, number> = {
    delivered: 0,
    student_absent: 0,
    provider_absent: 0,
    school_closed: 0,
  };
  for (const e of entries) {
    if (entryProblem(e) !== null || weekStart(e.date) !== start) continue;
    total[e.outcome] += e.minutes;
  }
  const shortfall = Math.max(0, required - total.delivered);
  return {
    weekOf: start,
    required,
    delivered: total.delivered,
    studentAbsent: total.student_absent,
    providerAbsent: total.provider_absent,
    schoolClosed: total.school_closed,
    shortfall,
    makeUpOwed: Math.min(shortfall, total.provider_absent),
  };
}

/** Summaries for each week from the first entry's week through the week of `today`, oldest first. */
export function summarizeRange(
  entries: readonly LogEntry[],
  today: string,
  requiredPerWeek: number,
): WeekSummary[] {
  const last = weekStart(today);
  const dates = entries.filter((e) => entryProblem(e) === null).map((e) => e.date);
  if (last === null || dates.length === 0) return [];
  const first = weekStart(dates.reduce((a, b) => (a < b ? a : b)));
  if (first === null || first > last) return [];
  const out: WeekSummary[] = [];
  for (let n = dayNumber(first)!; n <= dayNumber(last)!; n += 7) {
    const s = summarizeWeek(entries, new Date(n * DAY).toISOString().slice(0, 10), requiredPerWeek);
    if (s) out.push(s);
  }
  return out;
}

/** Plain-words line for a week: "Delivered 60 of 90 minutes; 30 short, 30 owed in make-up." */
export function weekLine(s: WeekSummary): string {
  const base = `Delivered ${s.delivered} of ${s.required} minutes`;
  if (s.shortfall === 0) return `${base}.`;
  return s.makeUpOwed > 0
    ? `${base}; ${s.shortfall} short, ${s.makeUpOwed} owed in make-up.`
    : `${base}; ${s.shortfall} short, none owed in make-up.`;
}
