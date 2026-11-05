import { describe, expect, it } from "vitest";
import { PAGE_TEXT, pageText } from "../src/data/pageText.ts";

// Collect every key path of an entry so a second language cannot leave a line out.
const shape = (v: unknown, path = ""): string[] =>
  Array.isArray(v)
    ? [`${path}[${v.length}]`, ...v.flatMap((x, i) => shape(x, `${path}[${i}]`))]
    : v && typeof v === "object"
      ? Object.entries(v).flatMap(([k, x]) => shape(x, path ? `${path}.${k}` : k))
      : [path];

describe("plain-language page text table", () => {
  it("only has English until a bilingual reader has seen the English as final", () => {
    expect(Object.keys(PAGE_TEXT)).toEqual(["en"]);
  });
  it("every listed language has the same lines, in the same shape, as English", () => {
    const english = shape(PAGE_TEXT.en);
    for (const text of Object.values(PAGE_TEXT)) expect(shape(text)).toEqual(english);
  });
  it("no line is empty", () => {
    const lines = (v: unknown): string[] =>
      typeof v === "string"
        ? [v]
        : Array.isArray(v)
          ? v.flatMap(lines)
          : v && typeof v === "object"
            ? Object.values(v).flatMap(lines)
            : [];
    for (const line of lines(pageText())) expect(line.trim().length).toBeGreaterThan(0);
  });
  it("keeps both who-to-ask placeholder lines marked", () => {
    const t = pageText();
    expect(t.help.placeholder).toContain("Placeholder wording");
    expect(t.accessibility.placeholder).toContain("Placeholder wording");
  });
});
