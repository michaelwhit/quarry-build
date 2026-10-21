import { describe, expect, it } from "vitest";
import {
  MAX_COLUMNS,
  MAX_FIELD,
  MAX_ROWS,
  detectMapping,
  isComplete,
  normalizeGrade,
  parseCsv,
  planImport,
  readyRows,
  type CsvTable,
} from "../src/data/csv.ts";

const table = (text: string): CsvTable => {
  const r = parseCsv(text);
  if (!r.ok) throw new Error(r.message);
  return r.table;
};
const planFor = (
  text: string,
  existing = [] as { firstName: string; lastName: string; grade: string }[],
) => {
  const t = table(text);
  return planImport(t, detectMapping(t.headers), existing);
};

describe("parseCsv", () => {
  it("reads headers and rows", () => {
    expect(table("First,Last\nAva,Stone\nBen,Reed\n")).toEqual({
      headers: ["First", "Last"],
      rows: [
        ["Ava", "Stone"],
        ["Ben", "Reed"],
      ],
      lines: [2, 3],
    });
  });
  it("handles quotes, a byte-order mark and Windows line endings", () => {
    const t = table('﻿Name,Note\r\n"Stone, Ava","says ""hi"""\r\n');
    expect(t.headers).toEqual(["Name", "Note"]);
    expect(t.rows).toEqual([["Stone, Ava", 'says "hi"']]);
  });
  it("skips blank rows and pads short rows", () => {
    expect(table("A,B,C\n\n1,2\n").rows).toEqual([["1", "2", ""]]);
  });
  it("rejects bad files in plain words", () => {
    expect(parseCsv("")).toMatchObject({ ok: false });
    expect(parseCsv('A\n"open')).toMatchObject({ ok: false });
    const wide = Array.from({ length: MAX_COLUMNS + 1 }, (_, i) => `c${i}`).join(",");
    expect(parseCsv(wide)).toMatchObject({ ok: false });
    expect(parseCsv(`A\n${"x".repeat(MAX_FIELD + 1)}`)).toMatchObject({ ok: false });
    const many = "A\n" + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `r${i}`).join("\n");
    expect(parseCsv(many)).toMatchObject({ ok: false });
  });
  it("accepts exactly the row limit", () => {
    const text = "A\n" + Array.from({ length: MAX_ROWS }, (_, i) => `r${i}`).join("\n");
    const r = parseCsv(text);
    expect(r.ok && r.table.rows.length).toBe(MAX_ROWS);
  });
});

describe("detectMapping and normalizeGrade", () => {
  it("finds common header names", () => {
    const m = detectMapping(["Student_ID", "First Name", "last-name", "Grade Level"]);
    expect(m).toEqual({ firstName: 1, lastName: 2, grade: 3 });
    expect(isComplete(m)).toBe(true);
    expect(isComplete(detectMapping(["Name"]))).toBe(false);
  });
  it("turns grade words into PK, K or 1 to 12", () => {
    expect(normalizeGrade("3rd")).toBe("3");
    expect(normalizeGrade("Grade 03")).toBe("3");
    expect(normalizeGrade(" kindergarten ")).toBe("K");
    expect(normalizeGrade("Pre-K")).toBe("PK");
    expect(normalizeGrade("12")).toBe("12");
    for (const bad of ["13", "0", "", "five"]) expect(normalizeGrade(bad)).toBeNull();
  });
});

describe("planImport", () => {
  it("marks complete rows ready", () => {
    const plan = planFor("First,Last,Grade\nAva,Stone,3\nBen,Reed,K\n");
    expect(readyRows(plan)).toHaveLength(2);
    expect(plan.map((r) => r.line)).toEqual([2, 3]);
  });
  it("explains problems", () => {
    const plan = planFor("First,Last,Grade\n,Stone,3\nAva,,3\nBen,Reed,\nCal,Dunn,13\n");
    expect(plan.map((r) => r.status)).toEqual([
      { kind: "problem", why: "No first name." },
      { kind: "problem", why: "No last name." },
      { kind: "problem", why: "No grade." },
      { kind: "problem", why: 'Grade "13" is not one of PK, K or 1 to 12.' },
    ]);
  });
  it("skips repeats in the file and on the list", () => {
    const plan = planFor("First,Last,Grade\nava,STONE,3rd\nBen,Reed,4\nben,reed,4\nBen,Reed,5\n", [
      { firstName: "Ava", lastName: "Stone", grade: "3" },
    ]);
    expect(plan.map((r) => r.status.kind)).toEqual(["duplicate", "ready", "duplicate", "ready"]);
  });
  it("flags names that are too long", () => {
    const plan = planFor(`First,Last,Grade\n${"a".repeat(41)},Stone,3\n`);
    expect(plan[0]?.status.kind).toBe("problem");
  });
});

describe("line numbers", () => {
  it("counts the file's own lines after blank rows and multi-line cells", () => {
    const text = 'first,last,grade\n\nAnn,Lee,3\n"Bo\nb",Kay,4\r\n\r\nCy,Ng,5\n';
    const parsed = parseCsv(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.lines).toEqual([3, 4, 7]);
    const plan = planImport(parsed.table, detectMapping(parsed.table.headers), []);
    expect(plan.map((r) => r.line)).toEqual([3, 4, 7]);
  });

  it("falls back to simple numbering for a table built by hand", () => {
    const plan = planImport(
      { headers: ["first", "last", "grade"], rows: [["A", "B", "1"]] },
      { firstName: 0, lastName: 1, grade: 2 },
      [],
    );
    expect(plan[0]!.line).toBe(2);
  });
});
