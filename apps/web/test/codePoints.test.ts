import { describe, expect, it } from "vitest";
import { clip, count, within } from "../src/data/codePoints.ts";

// Vectors: one code point is one character for every limit, however many UTF-16 units it takes.
const SMILE = "\u{1F600}"; // one astral code point, two units
const TEACHER = "\u{1F469}‍\u{1F3EB}"; // woman + joiner + school: three code points
const E_ACUTE = "é"; // letter plus combining mark: two code points

/** A surrogate half with no partner: what cutting inside an emoji leaves behind. */
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("counting in code points", () => {
  it.each([
    ["plain", "abc", 3],
    ["emoji", SMILE, 1],
    ["joined emoji", TEACHER, 3],
    ["combining mark", E_ACUTE, 2],
    ["empty", "", 0],
  ])("%s", (_name, text, n) => {
    expect(count(text)).toBe(n);
    expect(within(text, n)).toBe(true);
    if (n > 0) expect(within(text, n - 1)).toBe(false);
  });

  it("clips on a code point, never inside an emoji", () => {
    expect(clip(SMILE.repeat(5), 3)).toBe(SMILE.repeat(3));
    expect(clip(TEACHER, 2)).toBe("\u{1F469}‍");
    expect(clip(E_ACUTE, 1)).toBe("e");
    expect(clip("abc", 10)).toBe("abc");
    for (const out of [clip(SMILE.repeat(5), 3), clip(TEACHER, 1)]) expect(out).not.toMatch(LONE);
  });
});
