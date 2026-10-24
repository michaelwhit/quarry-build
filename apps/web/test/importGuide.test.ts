import { describe, expect, it } from "vitest";
import { columnSamples, sampleLine } from "../src/data/importGuide.ts";
import { parseCsv } from "../src/data/csv.ts";
import { EXAMPLE_FILE } from "../src/data/importExample.ts";

const table = (text: string) => {
  const r = parseCsv(text);
  if (!r.ok) throw new Error(r.message);
  return r.table;
};

describe("import column samples", () => {
  const t = table(EXAMPLE_FILE);

  it("lists the first different values of a column", () => {
    expect(columnSamples(t, 1)).toEqual(["3", "K", "5"]);
  });

  it("skips blanks and repeats, and shortens long values", () => {
    const x = table(
      "Name,Grade\nAvery,\nBlake,3\nCasey,3\nDevon,Averyveryveryverylonggradevalue\n",
    );
    expect(columnSamples(x, 1)).toEqual(["3", "Averyveryveryverylonggr…"]);
  });

  it("describes a column in words", () => {
    expect(sampleLine(t, 1)).toBe("Examples: 3, K, 5");
    expect(sampleLine(t, undefined)).toBe("");
    expect(sampleLine(table("Name,Grade\nAvery,\n"), 1)).toBe("This column is empty in the file.");
  });
});
