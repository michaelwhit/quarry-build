import type { DataPoint, Goal, MeasurementPlan } from "@synthetic/src/types.ts";

export type GoalStatus = "met" | "on_track" | "needs_attention" | "no_data";

export interface SeriesPoint {
  at: string;
  value: number;
}

/** One number per data point, on the same scale as the plan's target_value. */
export function pointValue(p: DataPoint): number | null {
  if (p.value_num !== null) return p.value_num;
  if (p.correct !== null) return p.correct;
  return null;
}

export function seriesFor(points: DataPoint[]): SeriesPoint[] {
  return points
    .map((p) => ({ at: p.observed_at, value: pointValue(p) }))
    .filter((p): p is SeriesPoint => p.value !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface GoalProgress {
  status: GoalStatus;
  /** Mean of the first three points, or undefined with no data. */
  baseline: number | undefined;
  /** Mean of the latest three points. */
  recent: number | undefined;
  /** recent / target, capped at 1.25 for display. */
  fraction: number;
}

/**
 * Status is judged against a straight line from the baseline to the target across the IEP year,
 * with a 15% tolerance. A teacher decides what the status means; this only orders the caseload.
 */
export function progressFor(
  series: SeriesPoint[],
  plan: Pick<MeasurementPlan, "target_value">,
  effectiveFrom: string,
  effectiveTo: string,
): GoalProgress {
  if (series.length === 0)
    return { status: "no_data", baseline: undefined, recent: undefined, fraction: 0 };
  const baseline = mean(series.slice(0, 3).map((s) => s.value));
  const recent = mean(series.slice(-3).map((s) => s.value));
  const target = plan.target_value;
  const fraction = Math.min(1.25, Math.max(0, recent / target));
  if (recent >= target) return { status: "met", baseline, recent, fraction };
  const last = series[series.length - 1]!.at;
  const span = Date.parse(effectiveTo) - Date.parse(effectiveFrom);
  const elapsed = Math.min(1, Math.max(0, (Date.parse(last) - Date.parse(effectiveFrom)) / span));
  const expected = baseline + (target - baseline) * elapsed;
  const status = recent >= expected - 0.15 * (target - baseline) ? "on_track" : "needs_attention";
  return { status, baseline, recent, fraction };
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  met: "Target met",
  on_track: "On track",
  needs_attention: "Needs attention",
  no_data: "No data yet",
};

const ORDER: Record<GoalStatus, number> = { needs_attention: 0, no_data: 1, on_track: 2, met: 3 };

export function worstStatus(statuses: GoalStatus[]): GoalStatus {
  if (statuses.length === 0) return "no_data";
  return statuses.reduce((a, b) => (ORDER[a] <= ORDER[b] ? a : b));
}

export function goalLabel(goal: Goal): string {
  return goal.area.replaceAll("_", " ");
}

export interface Due {
  period: "day" | "week" | "month";
  required: number;
  done: number;
  due: boolean;
}

/**
 * How many sessions the goal's schedule asks for in the current day, week (Monday start) or month,
 * and how many are already saved in that window.
 */
export function dueFor(frequency: string, series: SeriesPoint[], now: Date = new Date()): Due {
  const f = frequency.trim().toLowerCase();
  const times = /^(\d+)x weekly$/.exec(f);
  const period: Due["period"] = f === "daily" ? "day" : f === "monthly" ? "month" : "week";
  const required = times?.[1] ? Math.max(1, Number(times[1])) : 1;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "month") start.setDate(1);
  const done = series.filter((p) => Date.parse(p.at) >= start.getTime()).length;
  return { period, required, done, due: done < required };
}
