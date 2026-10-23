import { describe, expect, it } from "vitest";
import { targetText } from "../src/data/targetText.ts";

describe("targetText", () => {
  it("does not repeat a number the target already states", () => {
    expect(targetText("8 of 10 correct", 8, null)).toBe("8 of 10 correct");
    expect(targetText("5 initiations per period", 5, "initiations")).toBe(
      "5 initiations per period",
    );
    expect(targetText("80% accuracy", 80, "%")).toBe("80% accuracy");
  });
  it("adds the number when the target does not state it", () => {
    expect(targetText("Independent", 4, "steps")).toBe("Independent (4 steps)");
    expect(targetText("Scores 3 or higher", 4, null)).toBe("Scores 3 or higher (4)");
  });
  it("does not mistake part of another number for the target", () => {
    expect(targetText("18 of 20 correct", 8, null)).toBe("18 of 20 correct (8)");
    expect(targetText("2.5 per period", 5, null)).toBe("2.5 per period (5)");
    expect(targetText("Reach 8.5", 8, null)).toBe("Reach 8.5 (8)");
  });
  it("counts a number that ends a sentence", () => {
    expect(targetText("Reach 8.", 8, null)).toBe("Reach 8.");
    expect(targetText("Reach 8. Then hold.", 8, null)).toBe("Reach 8. Then hold.");
  });
});
