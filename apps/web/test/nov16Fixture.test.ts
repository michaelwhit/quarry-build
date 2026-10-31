import { afterEach, describe, expect, it } from "vitest";
import { dueView, setSampleAnchor } from "../src/data/due.ts";
import { loadSampleAsOf } from "../src/data/workspace.ts";

const needsData = (today: string) =>
  dueView(today).managers.reduce((n, m) => n + m.needsData.length, 0);

// The Nov 16 demo: the phone's clock says Nov 16 and the director taps Load sample students.
describe("the practice data on Nov 16", () => {
  afterEach(() => setSampleAnchor(null));

  it("shows no student as needing data when the samples are loaded that day", () => {
    setSampleAnchor("2026-11-16");
    loadSampleAsOf("2026-11-16");
    expect(needsData("2026-11-16")).toBe(0);
  });
  it("shows every student as needing data if the day is moved forward after an Oct 30 load", () => {
    setSampleAnchor("2026-10-30");
    loadSampleAsOf("2026-10-30");
    expect(needsData("2026-11-16")).toBe(12);
  });
});
