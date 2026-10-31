import { headerKey, type CsvTable } from "./csv.ts";

// Reads a OneRoster 1.1 users.csv (the file a student information system makes for rostering) as a
// plain roster. Only the first name, last name and first grade of each student are kept; the ids,
// usernames, emails, phones and everything else in the file are dropped here and never shown.
// CSV import stays the fallback for any other spreadsheet.

const REQUIRED = ["sourcedid", "role", "givenname", "familyname"];

/** True when the headers look like a OneRoster users file. */
export function isOneRosterUsers(headers: string[]): boolean {
  const keys = new Set(headers.map(headerKey));
  return REQUIRED.every((k) => keys.has(k));
}

export interface OneRosterRead {
  /** First name, last name and grade of each student, in file order, with the file's line numbers. */
  table: CsvTable;
  /** Students found, and the rows left out. */
  students: number;
  notStudents: number;
  removed: number;
}

const HEADERS = ["First name", "Last name", "Grade"];

/** A OneRoster `grades` cell can list several grades ("05,06"): the first is the student's grade. */
const firstGrade = (cell: string): string => cell.split(/[,;]/)[0]?.trim() ?? "";

export function readOneRosterUsers(table: CsvTable): OneRosterRead {
  const at = (name: string) => table.headers.map(headerKey).indexOf(name);
  const col = { role: at("role"), status: at("status"), enabled: at("enableduser") };
  const first = at("givenname");
  const last = at("familyname");
  const grades = at("grades");
  const rows: string[][] = [];
  const lines: number[] = [];
  let notStudents = 0;
  let removed = 0;
  table.rows.forEach((row, i) => {
    const cell = (c: number) => (c < 0 ? "" : (row[c] ?? "").trim());
    if (cell(col.role).toLowerCase() !== "student") {
      notStudents++;
      return;
    }
    if (
      cell(col.status).toLowerCase() === "tobedeleted" ||
      cell(col.enabled).toLowerCase() === "false"
    ) {
      removed++;
      return;
    }
    rows.push([cell(first), cell(last), firstGrade(cell(grades))]);
    lines.push(table.lines?.[i] ?? i + 2);
  });
  return {
    table: { headers: HEADERS, rows, lines },
    students: rows.length,
    notStudents,
    removed,
  };
}

/** One plain sentence about what was read, for the import page. */
export function oneRosterNote(r: OneRosterRead): string {
  const left = [
    r.notStudents > 0 ? `${r.notStudents} other ${r.notStudents === 1 ? "person" : "people"}` : "",
    r.removed > 0 ? `${r.removed} marked deleted or disabled` : "",
  ].filter(Boolean);
  return `Read as a OneRoster users file: ${r.students} student${r.students === 1 ? "" : "s"}${
    left.length > 0 ? `. Left out: ${left.join(" and ")}` : ""
  }. Only names and grades are used.`;
}
