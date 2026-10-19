/**
 * An independent TypeScript reading of the Demo App progress rules.
 * It exists to check that the shared test vectors agree with the spec text. The Swift package that
 * ships these rules must pass the same vectors; this file is not product code.
 */

const DAY_MS = 86_400_000;
const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/** BF-1, BF-2: whole typed text; hyphens, underscores and whitespace runs count as one space. */
export function isBlockedFrequency(text: string): boolean {
  const t = text.toLowerCase().replace(/[\s_-]+/g, " ");
  return (
    ["as needed", "as necessary", "when appropriate", "if needed", "per teacher discretion"].some(
      (p) => new RegExp(`\\b${p}\\b`).test(t),
    ) || /\bprn\b/.test(t)
  );
}

export interface Criterion {
  threshold: number;
  comparator: ">=" | "<=";
  window_kind: "consecutive" | "best_of";
  window: { n: number; m?: number };
  across?: { kind: string; count: number };
}

/** A session is a bare value, or a value with the setting, adult or material it was recorded in. */
export type Session = number | { value: number; setting?: string };

const valueOf = (s: Session) => (typeof s === "number" ? s : s.value);
const contextOf = (s: Session) => (typeof s === "number" ? undefined : s.setting);

/** MA-1 (best_of needs all m sessions), MA-3 (passing sessions must cover `across.count` contexts). */
export function isMastered(c: Criterion, sessions: readonly Session[]): boolean {
  const passes = (s: Session) =>
    c.comparator === ">=" ? valueOf(s) >= c.threshold : valueOf(s) <= c.threshold;
  const length = c.window_kind === "consecutive" ? c.window.n : (c.window.m ?? c.window.n);
  if (sessions.length < length) return false;
  const latest = sessions.slice(-length);
  const passing = latest.filter(passes);
  const met =
    c.window_kind === "consecutive" ? passing.length === length : passing.length >= c.window.n;
  if (!met) return false;
  if (c.across) {
    const contexts = new Set(passing.map(contextOf).filter((x): x is string => x !== undefined));
    return contexts.size >= c.across.count;
  }
  return true;
}

export const PROMPT_ORDER = [
  "independent",
  "gestural",
  "verbal",
  "model",
  "partial_physical",
  "full_physical",
] as const;

/** MA-2: percent correct where a correct trial counts only at or below the ceiling; all trials stay in the denominator. */
export function sessionValueWithCeiling(
  trials: readonly (readonly [prompt: string, correct: boolean])[],
  ceiling: string,
): number {
  if (trials.length === 0) return 0;
  const limit = PROMPT_ORDER.indexOf(ceiling as (typeof PROMPT_ORDER)[number]);
  const counted = trials.filter(
    ([prompt, ok]) => ok && PROMPT_ORDER.indexOf(prompt as (typeof PROMPT_ORDER)[number]) <= limit,
  ).length;
  return (counted / trials.length) * 100;
}

/** MA-4: 14 and 28 days after mastery, moved to the next school day when needed. */
export function maintenanceDue(masteryDate: string, cal: SchoolCalendar): [string, string] {
  const nextSchoolDay = (d: number): string => {
    for (; ; d++) {
      const date = new Date(d * DAY_MS);
      const dow = date.getUTCDay();
      const iso = date.toISOString().slice(0, 10);
      if (dow !== 0 && dow !== 6 && !cal.no_school.includes(iso)) return iso;
    }
  };
  const base = day(masteryDate);
  return [nextSchoolDay(base + 14), nextSchoolDay(base + 28)];
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type Point = readonly [date: string, value: number];

/** Aim line from the median of the first 3 points (at the third point's date) to the target at `end`. */
export function aimLine(points: readonly Point[], end: string, target: number) {
  if (points.length < 3) return null;
  const first = points.slice(0, 3);
  const baseline = median(first.map((p) => p[1]));
  const startDay = day(first[first.length - 1]![0]);
  const endDay = day(end);
  return {
    baseline,
    at: (date: string) =>
      baseline + ((target - baseline) * (day(date) - startDay)) / (endDay - startDay),
    slopePerDay: (target - baseline) / (endDay - startDay),
  };
}

export type Advice = "change_instruction" | "raise_goal" | "lower_target" | "none";

/** DR-1, DR-2: four-point rule on the latest 4 values, direction-aware. */
export function fourPointRule(
  values: readonly number[],
  aim: readonly number[],
  direction: ">=" | "<=" = ">=",
): Advice {
  if (values.length < 6) return "none";
  const v = values.slice(-4);
  const a = aim.slice(-4);
  const below = v.every((x, i) => x < a[i]!);
  const above = v.every((x, i) => x > a[i]!);
  if (direction === ">=") return below ? "change_instruction" : above ? "raise_goal" : "none";
  return above ? "change_instruction" : below ? "lower_target" : "none";
}

/** Ordinary least squares slope per calendar day over the latest 8 points. */
export function trendSlopePerDay(points: readonly Point[]): number | null {
  if (points.length < 8) return null;
  const p = points.slice(-8).map(([d, v]) => [day(d), v] as const);
  const n = p.length;
  const mx = p.reduce((s, [x]) => s + x, 0) / n;
  const my = p.reduce((s, [, y]) => s + y, 0) / n;
  const num = p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const den = p.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return num / den;
}

export type TrendStatus = "on_track" | "behind" | "ahead" | "none";

export function trendStatus(
  points: readonly Point[],
  aimSlopePerDay: number,
  direction: ">=" | "<=" = ">=",
): TrendStatus {
  const slope = trendSlopePerDay(points);
  if (slope === null || aimSlopePerDay === 0) return "none";
  // Look at progress in the favourable direction: a falling line is progress on a <= goal.
  const sign = direction === ">=" ? 1 : -1;
  const data = slope * sign;
  const aim = aimSlopePerDay * sign;
  const tolerance = Math.abs(aim) * 0.1;
  if (data < aim - tolerance) return "behind";
  if (data > aim + tolerance) return "ahead";
  return "on_track";
}

export interface SchoolCalendar {
  no_school: readonly string[];
}

/** School days after `lastData` up to and including `asOf`; weekends and listed days do not count. */
export function schoolDaysSince(lastData: string, asOf: string, cal: SchoolCalendar): number {
  let count = 0;
  for (let d = day(lastData) + 1; d <= day(asOf); d++) {
    const date = new Date(d * DAY_MS);
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (cal.no_school.includes(date.toISOString().slice(0, 10))) continue;
    count++;
  }
  return count;
}

/** DR-5, DR-6: with no data yet, count from the goal start, or from the day it was attached. */
export function isStale(
  lastData: string | null,
  asOf: string,
  cal: SchoolCalendar,
  goalStart: string | null = null,
  attachedOn: string | null = null,
): boolean {
  const since = lastData ?? goalStart ?? attachedOn;
  if (since === null) return false;
  return schoolDaysSince(since, asOf, cal) >= 10;
}
