/** The calendar day on the clock where the person is, as yyyy-mm-dd (not the UTC day). */
export function localDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The name of the saved practice-data file: it carries the local day. */
export const practiceFileName = (now: Date = new Date()): string =>
  `goalline-practice-${localDay(now)}.json`;
