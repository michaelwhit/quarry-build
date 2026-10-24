import { describe, expect, it } from "vitest";
import { dateTimeWithYear, dateWithYear } from "../src/data/dates.ts";

describe("dates shown with a year", () => {
  it("writes the day, month and year from the stored text", () => {
    expect(dateWithYear("2026-10-15")).toBe("Oct 15, 2026");
    expect(dateWithYear("2027-01-02T23:30:00Z")).toBe("Jan 2, 2027");
  });

  it("keeps the year on timestamps so last year's entry is not read as this year's", () => {
    expect(dateTimeWithYear("2026-10-15T12:00:00Z")).toMatch(/^Oct 1[456], 2026, /);
    expect(dateTimeWithYear("2025-10-15T15:42:00Z")).toContain("2025");
  });
});
