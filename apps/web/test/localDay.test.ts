import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localDay, practiceFileName } from "../src/data/localDay.ts";

const was = process.env["TZ"];
beforeAll(() => {
  process.env["TZ"] = "America/Chicago";
});
afterAll(() => {
  if (was === undefined) delete process.env["TZ"];
  else process.env["TZ"] = was;
});

describe("the local day", () => {
  it("is the school's own day late in the evening, when UTC is already tomorrow", () => {
    const late = new Date("2026-10-31T04:30:00Z");
    expect(late.toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(localDay(late)).toBe("2026-10-30");
  });

  it("matches the UTC day in the middle of the day", () => {
    expect(localDay(new Date("2026-10-30T17:00:00Z"))).toBe("2026-10-30");
  });

  it("names the saved practice file with the local day", () => {
    expect(practiceFileName(new Date("2026-10-31T04:30:00Z"))).toBe(
      "goalline-practice-2026-10-30.json",
    );
  });
});
