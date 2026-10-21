// Reading a spreadsheet export (CSV) into students. Pure functions, no browser or storage use, so
// the rules can be tested on their own. The rules match the Mac and iPhone import screen.

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
}

export type ParseResult = { ok: true; table: CsvTable } | { ok: false; message: string };

const fail = (message: string): ParseResult => ({ ok: false, message });

/** Reads comma-separated text: quoted cells, doubled quotes, line breaks in quotes, any line ending. */
export function parseCsv(input: string): ParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
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
    if (field.length > MAX_FIELD)
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
        if (field.length > MAX_FIELD)
          bad = `A cell is longer than ${MAX_FIELD} characters. Check that this is the right file.`;
      }
    } else if (ch === '"' && field === "" && !wasQuoted) {
      inQuotes = true;
      wasQuoted = true;
    } else if (ch === ",") bad = endField();
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
  const head = records[0];
  if (!head) return fail("The file is empty.");
  const headers = head.map((h) => h.trim());
  const rows = records.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { ok: true, table: { headers, rows, lines: starts.slice(1) } };
}

export type ImportField = "firstName" | "lastName" | "preferredName" | "grade";
export const FIELDS: { key: ImportField; title: string; required: boolean }[] = [
  { key: "firstName", title: "First name", required: true },
  { key: "lastName", title: "Last name", required: true },
  { key: "preferredName", title: "Preferred name", required: false },
  { key: "grade", title: "Grade", required: true },
];

/** The column number for each field, or undefined when the file has no such column. */
export type Mapping = Partial<Record<ImportField, number>>;

const ALIASES: Record<ImportField, string[]> = {
  firstName: ["firstname", "first", "givenname", "fname"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  preferredName: ["preferredname", "preferred", "nickname", "goesby"],
  grade: ["grade", "gradelevel", "gr", "currentgrade"],
};

const headerKey = (h: string) => h.toLowerCase().replace(/[ _-]/g, "");

/** Guesses which column is which from the header row. A column fills at most one field. */
export function detectMapping(headers: string[]): Mapping {
  const keys = headers.map(headerKey);
  const taken = new Set<number>();
  const mapping: Mapping = {};
  for (const { key } of FIELDS) {
    const at = keys.findIndex((k, i) => !taken.has(i) && ALIASES[key].includes(k));
    if (at >= 0) {
      mapping[key] = at;
      taken.add(at);
    }
  }
  return mapping;
}

export const isComplete = (m: Mapping) =>
  FIELDS.filter((f) => f.required).every((f) => m[f.key] !== undefined);

/** Turns what a spreadsheet says ("3rd", "Grade 03", "Kindergarten") into PK, K or 1 to 12. */
export function normalizeGrade(text: string): string | null {
  let v = text.trim().toUpperCase();
  v = v.replace(/^(GRADE |GR\. |GR )/, "").trim();
  if (["PK", "PRE-K", "PREK", "PRESCHOOL", "PRE K"].includes(v)) return "PK";
  if (["K", "KG", "KINDERGARTEN"].includes(v)) return "K";
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
    const firstName = cell(row, "firstName");
    const lastName = cell(row, "lastName");
    const preferredName = cell(row, "preferredName");
    const gradeText = cell(row, "grade");
    const grade = normalizeGrade(gradeText);
    let why: string | null = null;
    if (!firstName) why = "No first name.";
    else if (!lastName) why = "No last name.";
    else if ([firstName, lastName, preferredName].some((n) => n.length > MAX_NAME))
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
