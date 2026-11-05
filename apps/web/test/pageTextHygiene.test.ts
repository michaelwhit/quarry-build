import { describe, expect, it } from "vitest";
import { pageText } from "../src/data/pageText.ts";

function lines(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(lines);
  if (v && typeof v === "object") return Object.values(v).flatMap(lines);
  return [];
}

describe("plain-language page text hygiene", () => {
  const t = pageText();
  const all = lines(t);
  it("has no stray spaces, line breaks or doubled spaces", () => {
    for (const line of all) {
      expect(line, line).toBe(line.trim());
      expect(line, line).not.toMatch(/ {2}|\n|\t/);
    }
  });
  it("writes every longer line (seven words or more) with a closing full stop or question mark and no exclamation marks", () => {
    for (const line of all) {
      expect(line, line).not.toContain("!");
      if (line.split(" ").length >= 7) expect(line, line).toMatch(/[.?]$/);
    }
  });
  it("step counter is distinct and numeric for every step", () => {
    const total = t.tour.steps.length;
    const seen = t.tour.steps.map((_, i) => t.tour.stepOf(i + 1, total));
    expect(new Set(seen).size).toBe(total);
    for (const s of seen) expect(s).toMatch(/\d/);
  });
});
