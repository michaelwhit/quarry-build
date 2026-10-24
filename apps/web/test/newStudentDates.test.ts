import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addStudent, clearAll, getWorkspace } from "../src/data/workspace.ts";

const was = process.env["TZ"];
beforeAll(() => {
  process.env["TZ"] = "America/Chicago";
});
afterAll(() => {
  if (was === undefined) delete process.env["TZ"];
  else process.env["TZ"] = was;
});
beforeEach(() => clearAll());
afterEach(() => vi.useRealTimers());

const newestIep = () => getWorkspace().ieps.at(-1)!;

describe("dates stamped on a newly added student", () => {
  it("use the local day late in the evening, when UTC is already tomorrow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T04:30:00Z"));
    addStudent({ firstName: "Test", lastName: "Student", grade: "3" });
    const iep = newestIep();
    expect(iep.meeting_date).toBe("2026-10-30");
    expect(iep.effective_from).toBe("2026-10-30");
    expect(iep.annual_review_due).toBe("2027-10-29");
  });

  it("are the same in the middle of the day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T17:00:00Z"));
    addStudent({ firstName: "Test", lastName: "Student", grade: "3" });
    const iep = newestIep();
    expect(iep.meeting_date).toBe("2026-10-30");
    expect(iep.annual_review_due).toBe("2027-10-29");
  });
});
