// Reading a spreadsheet export (CSV) into students. Pure functions, no browser or storage use, so
// the rules can be tested on their own. The rules match the Mac and iPhone import screen.
import { within } from "./codePoints.ts";

export const MAX_ROWS = 500;
export const MAX_COLUMNS = 40;
export const MAX_FIELD = 200;
export const MAX_NAME = 40;
export const MAX_FILE_BYTES = 1_000_000;

export interface CsvTable {
  headers: string[];
  rows: string[][];
  /** The line of the file where each row starts (the header is line 1), when known. */
  lines?: number[];
  /** The line the header row was found on, when it is not the first line. */
  headerLine?: number;
}

export type ParseResult = { ok: true; table: CsvTable } | { ok: false; message: string };

const fail = (message: string): ParseResult => ({ ok: false, message });

/** Lines read when guessing the separator, so a title line above the header does not hide it. */
const DELIMITER_LINES = 5;

const DELIMITERS = [",", ";", "\t", "|"] as const;

/** The separator a spreadsheet used, found by counting on the first few lines outside quotes. Comma if unsure. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>();
  let inQuotes = false;
  let lines = 0;
  let hasContent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasContent = true;
    } else if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // CRLF is one line break, and blank lines do not use up the sample.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (hasContent && ++lines >= DELIMITER_LINES) break;
      hasContent = false;
    } else {
      hasContent = true;
      if (!inQuotes && (DELIMITERS as readonly string[]).includes(ch))
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  let best = ",";
  let most = 0;
  for (const d of DELIMITERS) {
    const n = counts.get(d) ?? 0;
    if (n > most) {
      best = d;
      most = n;
    }
  }
  return best;
}

/** How many leading lines may be a report title or blank notes above the real header row. */
const HEADER_SEARCH = 10;

/** Reads delimited text: quoted cells, doubled quotes, line breaks in quotes, any line ending. */
export function parseCsv(input: string): ParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let wasQuoted = false;
  // Physical line of the file (1 for the first) where each record starts, for row numbers.
  const starts: number[] = [];
  let line = 1;
  let startLine = 1;

  const endField = (): string | null => {
    if (!within(field, MAX_FIELD))
      return `A cell is longer than ${MAX_FIELD} characters. Check that this is the right file.`;
    row.push(field);
    field = "";
    wasQuoted = false;
    return row.length > MAX_COLUMNS ? `The file has more than ${MAX_COLUMNS} columns.` : null;
  };
  const endRow = (): string | null => {
    const bad = endField();
    if (bad) return bad;
    if (!(row.length === 1 && row[0] === "")) {
      records.push(row);
      starts.push(startLine);
    }
    row = [];
    return records.length > MAX_ROWS + 1
      ? `The file has more than ${MAX_ROWS} students. Split it and import in parts.`
      : null;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    let bad: string | null = null;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        field += ch;
        if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line++;
        if (!within(field, MAX_FIELD))
          bad = `A cell is longer than ${MAX_FIELD} characters. Check that this is the right file.`;
      }
    } else if (ch === '"' && field === "" && !wasQuoted) {
      inQuotes = true;
      wasQuoted = true;
    } else if (ch === delimiter) bad = endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line++;
      bad = endRow();
      startLine = line;
    } else field += ch;
    if (bad) return fail(bad);
  }
  if (inQuotes)
    return fail("A quoted cell is never closed. Check the file for a stray quote mark.");
  if (field !== "" || row.length > 0 || wasQuoted) {
    const bad = endRow();
    if (bad) return fail(bad);
  }
  if (records.length === 0) return fail("The file is empty.");
  const at = headerRowAt(records);
  const headers = (records[at] as string[]).map((h) => h.trim());
  const rows = records.slice(at + 1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  const table: CsvTable = { headers, rows, lines: starts.slice(at + 1) };
  if (at > 0) table.headerLine = starts[at] as number;
  return { ok: true, table };
}

export type ImportField = "firstName" | "lastName" | "fullName" | "preferredName" | "grade";
export const FIELDS: { key: ImportField; title: string; required: boolean }[] = [
  { key: "firstName", title: "First name", required: true },
  { key: "lastName", title: "Last name", required: true },
  {
    key: "fullName",
    title: "Full name in one column (instead of first and last)",
    required: false,
  },
  { key: "preferredName", title: "Preferred name", required: false },
  { key: "grade", title: "Grade", required: true },
];

/** The column number for each field, or undefined when the file has no such column. */
export type Mapping = Partial<Record<ImportField, number>>;

// Header names are compared after dropping case, spaces and punctuation, so "Student First Name",
// "student_first_name" and "STUDENT FIRST-NAME" are the same.
const ALIASES: Record<ImportField, string[]> = {
  firstName: [
    "firstname",
    "first",
    "givenname",
    "given",
    "fname",
    "studentfirstname",
    "studentfirst",
    "legalfirstname",
    "legalfirst",
    "firstnamestudent",
  ],
  lastName: [
    "lastname",
    "last",
    "surname",
    "familyname",
    "lname",
    "studentlastname",
    "studentlast",
    "legallastname",
    "legallast",
    "lastnamestudent",
  ],
  fullName: [
    "name",
    "fullname",
    "studentname",
    "student",
    "legalname",
    "pupilname",
    "studentfullname",
  ],
  preferredName: [
    "preferredname",
    "preferred",
    "preferredfirstname",
    "nickname",
    "goesby",
    "studentpreferredname",
  ],
  grade: [
    "grade",
    "gradelevel",
    "gr",
    "currentgrade",
    "studentgrade",
    "enrolledgrade",
    "gradelvl",
    "grd",
    "gradelevelcurrent",
  ],
};

const headerKey = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Guesses which column is which from the header row. A column fills at most one field. */
export function detectMapping(headers: string[]): Mapping {
  const keys = headers.map(headerKey);
  const taken = new Set<number>();
  const mapping: Mapping = {};
  for (const { key } of FIELDS) {
    // One "Name" column is only taken when the file has no separate first and last name columns.
    if (key === "fullName" && (mapping.firstName !== undefined || mapping.lastName !== undefined))
      continue;
    const at = keys.findIndex((k, i) => !taken.has(i) && ALIASES[key].includes(k));
    if (at >= 0) {
      mapping[key] = at;
      taken.add(at);
    }
  }
  return mapping;
}

/** The first line that looks like a header (two or more known columns), within the first few lines. */
function headerRowAt(records: string[][]): number {
  for (let i = 0; i < Math.min(records.length, HEADER_SEARCH); i++) {
    const found = Object.keys(detectMapping((records[i] as string[]).map((h) => h.trim()))).length;
    if (found >= 2) return i;
  }
  return 0;
}

/** Needs a grade and either a full-name column or both first and last name columns. */
export const isComplete = (m: Mapping) =>
  m.grade !== undefined &&
  (m.fullName !== undefined || (m.firstName !== undefined && m.lastName !== undefined));

/**
 * Splits one name cell. "Stone, Ava" is last name first; "Ava Stone" is first name first, with
 * everything after the first word as the last name ("Ava van der Berg"). One word has no last name.
 */
export function splitFullName(text: string): { firstName: string; lastName: string } {
  const t = text.trim().replace(/\s+/g, " ");
  const comma = t.indexOf(",");
  if (comma >= 0)
    return { lastName: t.slice(0, comma).trim(), firstName: t.slice(comma + 1).trim() };
  const space = t.indexOf(" ");
  if (space < 0) return { firstName: t, lastName: "" };
  return { firstName: t.slice(0, space), lastName: t.slice(space + 1).trim() };
}

const GRADE_WORDS = [
  "FIRST",
  "SECOND",
  "THIRD",
  "FOURTH",
  "FIFTH",
  "SIXTH",
  "SEVENTH",
  "EIGHTH",
  "NINTH",
  "TENTH",
  "ELEVENTH",
  "TWELFTH",
];

/** Turns what a spreadsheet says ("3rd", "Grade 03", "Third grade", "Kindergarten") into PK, K or 1 to 12. */
export function normalizeGrade(text: string): string | null {
  let v = text.trim().toUpperCase().replace(/\s+/g, " ");
  v = v
    .replace(/^(GRADE|GR)[ .:-]*/, "")
    .replace(/ GRADE$/, "")
    .trim();
  if (["PK", "PRE-K", "PREK", "PRESCHOOL", "PRE K"].includes(v)) return "PK";
  if (["K", "KG", "KINDERGARTEN"].includes(v)) return "K";
  const word = GRADE_WORDS.indexOf(v);
  if (word >= 0) return String(word + 1);
  v = v.replace(/(ST|ND|RD|TH)$/, "");
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 12 ? String(n) : null;
}

export type RowStatus =
  { kind: "ready" } | { kind: "duplicate" } | { kind: "problem"; why: string };

export interface PlannedRow {
  /** Line of the file where the row starts, counting the header as line 1. */
  line: number;
  firstName: string;
  lastName: string;
  preferredName: string;
  grade: string;
  status: RowStatus;
}

export interface KnownStudent {
  firstName: string;
  lastName: string;
  grade: string;
}

const identity = (f: string, l: string, g: string) =>
  [f, l, g].map((x) => x.toLowerCase()).join("|");

/** Decides, row by row, what confirming the import would do. */
export function planImport(
  table: CsvTable,
  mapping: Mapping,
  existing: KnownStudent[],
): PlannedRow[] {
  const seen = new Set(existing.map((e) => identity(e.firstName, e.lastName, e.grade)));
  const cell = (row: string[], f: ImportField) => {
    const at = mapping[f];
    return at === undefined ? "" : (row[at] ?? "");
  };
  return table.rows.map((row, i) => {
    const useSeparate = mapping.firstName !== undefined && mapping.lastName !== undefined;
    const split = useSeparate ? null : splitFullName(cell(row, "fullName"));
    const firstName = split ? split.firstName : cell(row, "firstName");
    const lastName = split ? split.lastName : cell(row, "lastName");
    const preferredName = cell(row, "preferredName");
    const gradeText = cell(row, "grade");
    const grade = normalizeGrade(gradeText);
    let why: string | null = null;
    if (!firstName) why = "No first name.";
    else if (!lastName) why = "No last name.";
    else if ([firstName, lastName, preferredName].some((n) => !within(n, MAX_NAME)))
      why = `A name is longer than ${MAX_NAME} characters.`;
    else if (!grade)
      why = gradeText ? `Grade "${gradeText}" is not one of PK, K or 1 to 12.` : "No grade.";
    let status: RowStatus = { kind: "ready" };
    if (why) status = { kind: "problem", why };
    else if (grade) {
      const key = identity(firstName, lastName, grade);
      if (seen.has(key)) status = { kind: "duplicate" };
      else seen.add(key);
    }
    return {
      line: table.lines?.[i] ?? i + 2,
      firstName,
      lastName,
      preferredName,
      grade: grade ?? gradeText,
      status,
    };
  });
}

export const readyRows = (plan: PlannedRow[]) => plan.filter((r) => r.status.kind === "ready");
