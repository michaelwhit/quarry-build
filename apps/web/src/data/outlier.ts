// "Is this right?" check for a data point about to be saved. It looks at the last few saved values
// of the same goal and asks once when the new value sits far outside them. It only asks: the
// teacher's answer decides, and a value is never changed or refused. Needs a few earlier points.

export const OUTLIER_LOOKBACK = 6;
export const OUTLIER_MIN_POINTS = 4;

/** Allowed distance from the middle of the recent values, as a share of the goal's scale. */
const MIN_SPREAD_SHARE = 0.2;
/** How many typical ups and downs away still counts as ordinary. */
const SPREAD_TIMES = 3;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

export interface OutlierCheck {
  /** True when the teacher should be asked "is this right?". */
  ask: boolean;
  low: number;
  high: number;
}

const NONE: OutlierCheck = { ask: false, low: 0, high: 0 };

/**
 * `previous` is the saved values in order, oldest first. `scale` is the goal's target value, used so
 * that a steady run of identical values does not make every small change look odd.
 */
export function checkOutlier(previous: number[], value: number, scale: number): OutlierCheck {
  const recent = previous.filter(Number.isFinite).slice(-OUTLIER_LOOKBACK);
  if (!Number.isFinite(value) || recent.length < OUTLIER_MIN_POINTS) return NONE;
  const mid = median(recent);
  const typical = median(recent.map((v) => Math.abs(v - mid)));
  const floor = Math.abs(Number.isFinite(scale) ? scale : 0) * MIN_SPREAD_SHARE;
  const spread = Math.max(typical * SPREAD_TIMES, floor, 1e-9);
  const low = mid - spread;
  const high = mid + spread;
  return { ask: value < low || value > high, low, high };
}

/** The sentence shown under the number. Plain words, no blame. */
export function outlierQuestion(value: number, unit: string, check: OutlierCheck): string {
  const round = (n: number) => String(Math.round(n * 10) / 10);
  return `${round(value)} ${unit} is far from the last few sessions (about ${round(Math.max(check.low, 0))} to ${round(check.high)}). Is this right?`;
}
