import { describe, expect, it } from "vitest";
import { checkOutlier, outlierQuestion } from "../src/data/outlier.ts";

const steady = [60, 65, 62, 66, 64, 63];

describe("outlier check", () => {
  it("does not ask with fewer than four earlier points", () => {
    expect(checkOutlier([60, 65, 62], 5, 100).ask).toBe(false);
    expect(checkOutlier([], 5, 100).ask).toBe(false);
  });

  it("does not ask for a value inside the recent range", () => {
    expect(checkOutlier(steady, 70, 100).ask).toBe(false);
    expect(checkOutlier(steady, 55, 100).ask).toBe(false);
  });

  it("asks for a value far outside the recent range", () => {
    expect(checkOutlier(steady, 6, 100).ask).toBe(true);
    expect(checkOutlier(steady, 100, 100).ask).toBe(true);
  });

  it("uses the scale so identical values do not make a small change odd", () => {
    const flat = [50, 50, 50, 50, 50];
    expect(checkOutlier(flat, 55, 100).ask).toBe(false);
    expect(checkOutlier(flat, 90, 100).ask).toBe(true);
  });

  it("does not ask about small counts on a goal whose target is zero", () => {
    const flat = [2, 2, 2, 2, 2];
    expect(checkOutlier(flat, 3, 0).ask).toBe(false);
    expect(checkOutlier([0, 0, 0, 0], 1, 0).ask).toBe(false);
    expect(checkOutlier(flat, 12, 0).ask).toBe(true);
  });

  it("looks only at the last six values", () => {
    const old = [1, 1, 1, 1, 1, 1, 1, 1];
    expect(checkOutlier([...old, ...steady], 64, 100).ask).toBe(false);
  });

  it("ignores values that are not numbers", () => {
    expect(checkOutlier(steady, Number.NaN, 100).ask).toBe(false);
    expect(checkOutlier([...steady, Number.NaN], 64, 100).ask).toBe(false);
  });

  it("words the question with the range", () => {
    const c = checkOutlier(steady, 6, 100);
    expect(outlierQuestion(6, "percent", c)).toMatch(
      /^6 percent is far from the last few sessions/,
    );
    expect(outlierQuestion(6, "percent", c)).toMatch(/Is this right\?$/);
  });
});
