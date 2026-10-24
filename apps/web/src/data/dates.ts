/** "Oct 15, 2026" from an ISO date or timestamp, read in UTC so the day matches the stored text. */
export const dateWithYear = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** "Oct 15, 2026, 3:42 PM" from a timestamp, in the viewer's own time zone. */
export const dateTimeWithYear = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
