import { describe, expect, it } from "vitest";
import { schoolDaysSince } from "../src/data/due.ts";
import { weeksToShift } from "../src/data/freshen.ts";
import { addSchoolDays } from "../src/data/meetingNotices.ts";

describe("school days added to a date", () => {
  it("goes across a leap day", () => {
    expect(addSchoolDays("2028-02-28", 1, [])).toBe("2028-02-29");
    expect(addSchoolDays("2028-02-28", 2, [])).toBe("2028-03-01");
    expect(addSchoolDays("2028-02-25", 1, [])).toBe("2028-02-28");
  });
  it("goes across a month end and a year end", () => {
    expect(addSchoolDays("2026-10-30", 1, [])).toBe("2026-11-02"); // a Friday to the Monday
    expect(addSchoolDays("2026-12-31", 1, [])).toBe("2027-01-01");
    expect(addSchoolDays("2026-12-31", 1, ["2027-01-01"])).toBe("2027-01-04");
    expect(addSchoolDays("2026-12-31", 2, ["2027-01-01"])).toBe("2027-01-05");
  });
  it("skips listed no-school days even with stray spaces, and 0 days stays put", () => {
    expect(addSchoolDays("2026-11-06", 1, [" 2026-11-09 "])).toBe("2026-11-10");
    expect(addSchoolDays("2026-10-30", 0, [])).toBe("2026-10-30");
  });
  it("gives nothing for a date that does not exist", () => {
    expect(addSchoolDays("2026-02-30", 1, [])).toBe("");
    expect(addSchoolDays("not a date", 1, [])).toBe("");
  });
});

describe("whole weeks the sample sessions move forward", () => {
  it("counts the leap day: yesterday is 14 days after Feb 21 on Mar 7 of a leap year, so two weeks", () => {
    expect(weeksToShift("2028-02-21T15:00:00Z", "2028-03-07")).toBe(2);
    expect(weeksToShift("2027-02-21T15:00:00Z", "2027-03-07")).toBe(1); // yesterday is 13 days on, one week
  });
  it("goes across a year end", () => {
    expect(weeksToShift("2026-12-24T15:00:00Z", "2027-01-08")).toBe(2);
  });
  it("never moves backwards, and ignores a bad day", () => {
    expect(weeksToShift("2026-11-01T15:00:00Z", "2026-10-30")).toBe(0);
    expect(weeksToShift("2026-10-15T15:00:00Z", "2026-13-40")).toBe(0);
  });
  it("keeps the demo days apart: Oct 30 and Nov 16 differ by whole weeks only", () => {
    const newest = "2026-10-15T15:00:00Z";
    expect(weeksToShift(newest, "2026-11-16") - weeksToShift(newest, "2026-10-30")).toBe(2);
  });
});

describe("school days since a date", () => {
  it("never counts the start day, and adds up across a split", () => {
    const whole = schoolDaysSince("2026-10-19", "2026-11-13");
    const split =
      schoolDaysSince("2026-10-19", "2026-10-30") + schoolDaysSince("2026-10-30", "2026-11-13");
    expect(whole).toBe(split);
    expect(schoolDaysSince("2026-10-30", "2026-10-30")).toBe(0);
  });
  it("is the same from one end of a weekend to the other", () => {
    expect(schoolDaysSince("2026-10-30", "2026-10-31")).toBe(0);
    expect(schoolDaysSince("2026-10-30", "2026-11-01")).toBe(0);
    expect(schoolDaysSince("2026-10-30", "2026-11-02")).toBe(1);
  });
});
