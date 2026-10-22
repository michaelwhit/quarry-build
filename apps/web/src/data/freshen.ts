// The made-up sessions end on a fixed date. For a demo they should look recent, so the sample
// loader slides every session forward by whole weeks (a Tuesday stays a Tuesday) until the newest
// one is no later than yesterday. Nothing else about a session changes.

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** Whole weeks to move sessions so the newest one is yesterday or earlier, never backwards. */
export function weeksToShift(newest: string, today: string): number {
  if (!ISO_DAY.test(today) || !ISO_DAY.test(newest.slice(0, 10))) return 0;
  const gap = dayNumber(today) - 1 - dayNumber(newest);
  return Number.isFinite(gap) ? Math.max(0, Math.floor(gap / 7)) : 0;
}

const moved = (iso: string, ms: number) =>
  new Date(Date.parse(iso) + ms).toISOString().replace(".000Z", "Z");

/** The same sessions with their times moved forward, or the originals when no move is needed. */
export function freshened<T extends { observed_at: string; client_created_at: string }>(
  points: T[],
  today: string,
): T[] {
  const newest = points.reduce((a, p) => (p.observed_at > a ? p.observed_at : a), "");
  if (newest === "") return points;
  const weeks = weeksToShift(newest, today);
  if (weeks === 0) return points;
  const ms = weeks * 7 * DAY_MS;
  return points.map((p) => ({
    ...p,
    observed_at: moved(p.observed_at, ms),
    client_created_at: moved(p.client_created_at, ms),
  }));
}
