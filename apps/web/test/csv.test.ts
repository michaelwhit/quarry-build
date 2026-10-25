import { describe, expect, it } from "vitest";
import {
  MAX_COLUMNS,
  MAX_FIELD,
  MAX_ROWS,
  detectMapping,
  isComplete,
  normalizeGrade,
  detectDelimiter,
  splitFullName,
  parseCsv,
  planImport,
  readyRows,
  type CsvTable,
} from "../src/data/csv.ts";
import { EXAMPLE_FILE } from "../src/data/importExample.ts";

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
  it("counts a name in code points, the same as the Swift name cap and the server", () => {
    const smile = "\u{1F600}"; // one code point, two UTF-16 units
    const ok = planFor(`First,Last,Grade\n${smile.repeat(40)},Stone,3\n`);
    expect(ok[0]?.status.kind).toBe("ready");
    const long = planFor(`First,Last,Grade\n${smile.repeat(41)},Stone,3\n`);
    expect(long[0]?.status.kind).toBe("problem");
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

describe("flexible files", () => {
  it("reads semicolon, tab and pipe separated files", () => {
    for (const d of [";", "\t", "|"]) {
      const t = table(
        ["First", "Last", "Grade"].join(d) + "\n" + ["Ava", "Stone", "3"].join(d) + "\n",
      );
      expect(t.headers).toEqual(["First", "Last", "Grade"]);
      expect(t.rows).toEqual([["Ava", "Stone", "3"]]);
    }
  });
  it("keeps commas inside quotes when the separator is a semicolon", () => {
    const t = table('Name;Grade\n"Stone, Ava";3\n');
    expect(t.rows).toEqual([["Stone, Ava", "3"]]);
  });
  it("counts CRLF as one break, so a title line and blank lines do not hide the separator", () => {
    for (const nl of ["\r\n", "\r", "\n"]) {
      const text = ["Caseload report", "", "", "", "First;Last;Grade", "Ava;Stone;3", ""].join(nl);
      expect(detectDelimiter(text)).toBe(";");
      const tabbed = text.replaceAll(";", "\t");
      const parsed = parseCsv(tabbed);
      expect(parsed.ok && parsed.table.headers).toEqual(["First", "Last", "Grade"]);
    }
  });

  it("is not fooled by a title line above the header", () => {
    expect(detectDelimiter("Caseload report\nFirst;Last;Grade\nAva;Stone;3\n")).toBe(";");
    expect(detectDelimiter("just one column\nAva\n")).toBe(",");
  });
  it("finds the header below a title and blank lines, with line numbers from the file", () => {
    const t = table(
      "Caseload report,\n,\n\nStudent First Name,Student Last Name,Grade Level\nAva,Stone,3\nBen,Reed,K\n",
    );
    expect(t.headers).toEqual(["Student First Name", "Student Last Name", "Grade Level"]);
    expect(t.headerLine).toBe(4);
    expect(t.lines).toEqual([5, 6]);
    const plan = planImport(t, detectMapping(t.headers), []);
    expect(plan.map((r) => [r.line, r.firstName, r.lastName, r.grade])).toEqual([
      [5, "Ava", "Stone", "3"],
      [6, "Ben", "Reed", "K"],
    ]);
  });
  it("has no headerLine when the header is the first line", () => {
    expect(table("First,Last,Grade\nA,B,3\n").headerLine).toBeUndefined();
  });
  it("recognises header names with spaces, punctuation and case", () => {
    expect(
      detectMapping(["STUDENT FIRST-NAME", "student_last_name", "Grade (Current)", "Nickname"]),
    ).toEqual({
      firstName: 0,
      lastName: 1,
      preferredName: 3,
    });
    expect(detectMapping(["Grade Level (Current)"])).toEqual({ grade: 0 });
  });
});

describe("one full-name column", () => {
  it("splits last-comma-first and first-last, and flags a single word", () => {
    expect(splitFullName("Stone, Ava")).toEqual({ firstName: "Ava", lastName: "Stone" });
    expect(splitFullName("  Ava   van der Berg ")).toEqual({
      firstName: "Ava",
      lastName: "van der Berg",
    });
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitFullName("Stone,")).toEqual({ firstName: "", lastName: "Stone" });
    expect(splitFullName("")).toEqual({ firstName: "", lastName: "" });
  });
  it("is used only when there are no separate first and last name columns", () => {
    expect(detectMapping(["Student Name", "Grade"])).toEqual({ fullName: 0, grade: 1 });
    expect(detectMapping(["Name", "First", "Last", "Grade"])).toEqual({
      firstName: 1,
      lastName: 2,
      grade: 3,
    });
    expect(isComplete({ fullName: 0, grade: 1 })).toBe(true);
    expect(isComplete({ fullName: 0 })).toBe(false);
    expect(isComplete({ firstName: 0, grade: 1 })).toBe(false);
  });
  it("plans rows from a mixed full-name column", () => {
    const plan = planFor('Student,Gr\n"Stone, Ava",03\nBen Reed,3rd grade\nCher,4\n');
    expect(plan.map((r) => [r.firstName, r.lastName, r.grade, r.status.kind])).toEqual([
      ["Ava", "Stone", "3", "ready"],
      ["Ben", "Reed", "3", "ready"],
      ["Cher", "", "4", "problem"],
    ]);
    expect(plan[2]?.status).toEqual({ kind: "problem", why: "No last name." });
  });
});

describe("more grade wordings", () => {
  it("accepts ordinal words, 'grade' before or after, and GR with no space", () => {
    for (const [text, want] of [
      ["Third", "3"],
      ["third grade", "3"],
      ["Grade: 3", "3"],
      ["GR3", "3"],
      ["Gr. 11", "11"],
      ["twelfth", "12"],
      ["3rd Grade", "3"],
      ["Grade K", "K"],
    ] as const)
      expect(normalizeGrade(text), text).toBe(want);
    for (const bad of ["Grade 13", "grade", "fifteenth", "green", "0"])
      expect(normalizeGrade(bad), bad).toBeNull();
  });
});

describe("the made-up example file", () => {
  it("is read whole: every row is ready, with the title line skipped and extra columns ignored", () => {
    const rows = planFor(EXAMPLE_FILE);
    expect(rows.map((r) => r.status.kind)).toEqual(["ready", "ready", "ready", "ready"]);
    expect(rows.map((r) => `${r.firstName} ${r.lastName} ${r.grade}`)).toEqual([
      "Avery Examplewood 3",
      "Blake Samplefield K",
      "Casey Teststone 5",
      "Devon Mockridge 7",
    ]);
  });
});
