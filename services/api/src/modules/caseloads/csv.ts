/**
 * Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF, a leading byte-order mark
 * (spreadsheet exports add one). Bounded so a hostile file cannot exhaust memory.
 */
export const LIMITS = { rows: 5000, columns: 40, fieldLength: 200 } as const;

export class CsvError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export interface ParsedCsv {
  headers: string[];
  /** One object per data row, keyed by the file's own header text. */
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const endField = () => {
    if (field.length > LIMITS.fieldLength) throw new CsvError("field_too_long");
    row.push(field);
    if (row.length > LIMITS.columns) throw new CsvError("too_many_columns");
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip fully blank lines (a trailing newline, or blank rows in a spreadsheet export).
    if (!(row.length === 1 && row[0] === "")) records.push(row);
    if (records.length > LIMITS.rows + 1) throw new CsvError("too_many_rows");
    row = [];
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
        if (field.length > LIMITS.fieldLength) throw new CsvError("field_too_long");
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
    i++;
  }
  if (inQuotes) throw new CsvError("unterminated_quote");
  if (field !== "" || row.length > 0) endRow();

  const [head, ...body] = records;
  if (!head) throw new CsvError("empty_file");
  const headers = head.map((h) => h.trim());
  return {
    headers,
    rows: body.map((r) => Object.fromEntries(headers.map((h, idx) => [h, (r[idx] ?? "").trim()]))),
  };
}
