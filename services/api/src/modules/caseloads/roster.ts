import type pg from "pg";
import type { FieldCrypto } from "../../crypto/fields.ts";
import { uuidv7 } from "../../ids.ts";
import type { Session } from "../../session.ts";
import { parseCsv } from "./csv.ts";
import { resolveColumns, type ColumnMapping } from "./mapping.ts";
import type { ImportReport, RowError } from "./report.ts";

const ALIASES = {
  local_student_id: ["local_student_id", "student_id", "student_number", "studentnumber", "id"],
  state_student_id: ["state_student_id", "nde_state_id", "adviser_id", "state_id"],
  first_name: ["first_name", "firstname", "first"],
  last_name: ["last_name", "lastname", "last"],
  dob: ["dob", "date_of_birth", "birthdate", "birth_date"],
  grade: ["grade", "grade_level"],
  school: ["school", "school_name", "building"],
};
const REQUIRED = ["local_student_id", "first_name", "last_name", "grade", "school"] as const;
const GRADE = /^(PK|K|[1-9]|1[0-2]|ADULT)$/;

export type DateFormat = "iso" | "mdy";

export function parseDate(value: string, format: DateFormat): string | undefined {
  const m =
    format === "iso"
      ? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
      : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!m) return undefined;
  const [y, mo, d] = format === "iso" ? [m[1]!, m[2]!, m[3]!] : [m[3]!, m[1]!, m[2]!];
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

interface Row {
  line: number;
  local: string;
  state?: string | undefined;
  first: string;
  last: string;
  dob?: string | undefined;
  grade: string;
  school: string;
}

export async function importRoster(
  c: pg.PoolClient,
  session: Session,
  crypto: FieldCrypto,
  input: { csv: string; commit: boolean; mapping?: ColumnMapping; dateFormat: DateFormat },
): Promise<ImportReport> {
  const { headers, rows: raw } = parseCsv(input.csv);
  const cols = resolveColumns(headers, ALIASES, input.mapping);
  const errors: RowError[] = [];
  for (const f of REQUIRED)
    if (!cols[f]) errors.push({ row: 0, field: f, code: "column_not_found" });
  if (errors.length > 0)
    return { committed: false, rows: raw.length, creates: 0, updates: 0, unchanged: 0, errors };

  const t = session.tenantId;
  const rows: Row[] = [];
  const seen = new Set<string>();
  raw.forEach((r, idx) => {
    const line = idx + 2; // header is line 1
    const get = (f: keyof typeof ALIASES) => (cols[f] ? (r[cols[f]!] ?? "") : "");
    const bad = (field: string, code: string) => errors.push({ row: line, field, code });
    const local = get("local_student_id");
    const grade = get("grade").toUpperCase();
    let dob: string | undefined;
    if (get("dob") !== "") {
      dob = parseDate(get("dob"), input.dateFormat);
      if (!dob) bad("dob", "invalid_date");
      else if (dob > new Date().toISOString().slice(0, 10) || dob < "1990-01-01")
        bad("dob", "date_out_of_range");
    }
    for (const f of ["first_name", "last_name", "school"] as const)
      if (get(f) === "") bad(f, "required");
    if (local === "") bad("local_student_id", "required");
    else if (seen.has(local.toLowerCase())) bad("local_student_id", "duplicate_in_file");
    seen.add(local.toLowerCase());
    if (!GRADE.test(grade)) bad("grade", "invalid_grade");
    rows.push({
      line,
      local,
      state: get("state_student_id") || undefined,
      first: get("first_name"),
      last: get("last_name"),
      dob,
      grade,
      school: get("school"),
    });
  });

  const schools = new Map(
    (
      await c.query<{ id: string; name: string }>(
        "SELECT id, name FROM school WHERE deleted_at IS NULL",
      )
    ).rows.map((s) => [s.name.trim().toLowerCase(), s.id]),
  );
  for (const r of rows) {
    if (r.school && !schools.has(r.school.toLowerCase()))
      errors.push({ row: r.line, field: "school", code: "unknown_school" });
  }

  const bidx = (local: string) => crypto.blindIndex(t, "student.local_student_id", local);
  const existingRes = await c.query<{
    id: string;
    school_id: string;
    grade: string;
    first_name_enc: Buffer;
    last_name_enc: Buffer;
    dob_enc: Buffer | null;
    state_student_id_enc: Buffer | null;
    local_bidx: Buffer;
  }>(
    `SELECT id, school_id, grade, first_name_enc, last_name_enc, dob_enc, state_student_id_enc,
            local_student_id_bidx AS local_bidx
     FROM student WHERE deleted_at IS NULL AND local_student_id_bidx IS NOT NULL`,
  );
  const existing = new Map(existingRes.rows.map((e) => [e.local_bidx.toString("hex"), e]));
  const inFile = new Set(rows.map((r) => bidx(r.local).toString("hex")));
  const missing = existingRes.rows.filter((e) => !inFile.has(e.local_bidx.toString("hex"))).length;

  let creates = 0;
  let updates = 0;
  let unchanged = 0;
  const writes: (() => Promise<unknown>)[] = [];
  for (const r of rows) {
    if (errors.some((e) => e.row === r.line)) continue;
    const schoolId = schools.get(r.school.toLowerCase())!;
    const found = existing.get(bidx(r.local).toString("hex"));
    // Every encrypted value is bound to the id of the row that will hold it.
    const rowId = found ? found.id : uuidv7();
    const enc = (label: Parameters<FieldCrypto["encrypt"]>[1], v: string | undefined) =>
      v === undefined ? null : crypto.encrypt(t, label, rowId, v);
    // A value that fails to authenticate counts as "different", so the import rewrites it.
    const dec = (label: Parameters<FieldCrypto["decrypt"]>[1], v: Buffer | null) => {
      if (!v) return undefined;
      try {
        return crypto.decrypt(t, label, rowId, v);
      } catch {
        return null;
      }
    };
    const nameBidx = crypto.blindIndex(t, "student.name", r.first, r.last);
    const stateBidx = r.state ? crypto.blindIndex(t, "student.state_student_id", r.state) : null;
    if (!found) {
      creates++;
      writes.push(() =>
        c.query(
          `INSERT INTO student (id, tenant_id, school_id, grade, first_name_enc, last_name_enc, name_bidx,
             local_student_id_enc, local_student_id_bidx, state_student_id_enc, state_student_id_bidx,
             dob_enc, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
          [
            rowId,
            t,
            schoolId,
            r.grade,
            enc("student.first_name", r.first),
            enc("student.last_name", r.last),
            nameBidx,
            enc("student.local_student_id", r.local),
            bidx(r.local),
            enc("student.state_student_id", r.state),
            stateBidx,
            enc("student.dob", r.dob),
            session.staffId,
          ],
        ),
      );
      continue;
    }
    const same =
      found.school_id === schoolId &&
      found.grade === r.grade &&
      dec("student.first_name", found.first_name_enc) === r.first &&
      dec("student.last_name", found.last_name_enc) === r.last &&
      dec("student.dob", found.dob_enc) === r.dob &&
      dec("student.state_student_id", found.state_student_id_enc) === r.state;
    if (same) {
      unchanged++;
      continue;
    }
    updates++;
    writes.push(() =>
      c.query(
        `UPDATE student SET school_id = $2, grade = $3, first_name_enc = $4, last_name_enc = $5, name_bidx = $6,
           state_student_id_enc = $7, state_student_id_bidx = $8, dob_enc = $9, updated_by = $10
         WHERE id = $1`,
        [
          found.id,
          schoolId,
          r.grade,
          enc("student.first_name", r.first),
          enc("student.last_name", r.last),
          nameBidx,
          enc("student.state_student_id", r.state),
          stateBidx,
          enc("student.dob", r.dob),
          session.staffId,
        ],
      ),
    );
  }

  errors.sort((x, y) => x.row - y.row || x.field.localeCompare(y.field));
  const committed = input.commit && errors.length === 0;
  if (committed) for (const w of writes) await w();
  return {
    committed,
    rows: rows.length,
    creates,
    updates,
    unchanged,
    missing_from_file: missing,
    errors,
  };
}
