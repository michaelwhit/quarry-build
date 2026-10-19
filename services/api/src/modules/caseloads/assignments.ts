import type pg from "pg";
import type { FieldCrypto } from "../../crypto/fields.ts";
import { SCHOOL_TODAY } from "../../scope.ts";
import { uuidv7 } from "../../ids.ts";
import type { Session } from "../../session.ts";
import { parseCsv } from "./csv.ts";
import { resolveColumns, type ColumnMapping } from "./mapping.ts";
import type { ImportReport, RowError } from "./report.ts";

const ALIASES = {
  staff_email: ["staff_email", "email", "teacher_email", "case_manager_email"],
  local_student_id: ["local_student_id", "student_id", "student_number", "studentnumber", "id"],
  relationship: ["relationship", "assignment_type", "type"],
};
const RELATIONSHIPS = new Set(["caseload", "service", "class_roster", "delegated"]);

/**
 * Assigns staff to students from a second CSV. The director grants every row, so a teacher can
 * never add themselves (security design section 3.1): a row naming the uploader is an error.
 */
export async function importAssignments(
  c: pg.PoolClient,
  session: Session,
  crypto: FieldCrypto,
  input: { csv: string; commit: boolean; mapping?: ColumnMapping },
): Promise<ImportReport> {
  const { headers, rows } = parseCsv(input.csv);
  const cols = resolveColumns(headers, ALIASES, input.mapping);
  const errors: RowError[] = [];
  for (const f of ["staff_email", "local_student_id"] as const) {
    if (!cols[f]) errors.push({ row: 0, field: f, code: "column_not_found" });
  }
  if (errors.length > 0)
    return { committed: false, rows: rows.length, creates: 0, updates: 0, unchanged: 0, errors };

  const staff = new Map(
    (
      await c.query<{ id: string; email: string }>(
        "SELECT id, email FROM staff WHERE status = 'active' AND deleted_at IS NULL",
      )
    ).rows.map((s) => [s.email.toLowerCase(), s.id]),
  );
  const students = new Map(
    (
      await c.query<{ id: string; bidx: Buffer }>(
        "SELECT id, local_student_id_bidx AS bidx FROM student WHERE deleted_at IS NULL AND local_student_id_bidx IS NOT NULL",
      )
    ).rows.map((s) => [s.bidx.toString("hex"), s.id]),
  );
  const active = new Set(
    (
      await c.query<{ staff_id: string; student_id: string; relationship: string }>(
        `SELECT staff_id, student_id, relationship FROM caseload_assignment
         WHERE deleted_at IS NULL AND (end_date IS NULL OR end_date >= ${SCHOOL_TODAY})`,
      )
    ).rows.map((a) => `${a.staff_id}|${a.student_id}|${a.relationship}`),
  );

  let creates = 0;
  let unchanged = 0;
  const writes: (() => Promise<unknown>)[] = [];
  const seen = new Set<string>();
  rows.forEach((r, idx) => {
    const line = idx + 2;
    const bad = (field: string, code: string) => errors.push({ row: line, field, code });
    const email = (r[cols.staff_email!] ?? "").toLowerCase();
    const local = r[cols.local_student_id!] ?? "";
    const rel = cols.relationship
      ? (r[cols.relationship] ?? "").toLowerCase() || "caseload"
      : "caseload";
    const staffId = staff.get(email);
    const studentId = students.get(
      crypto.blindIndex(session.tenantId, "student.local_student_id", local).toString("hex"),
    );
    if (!staffId) bad("staff_email", "unknown_staff");
    else if (staffId === session.staffId) bad("staff_email", "cannot_assign_self");
    if (!studentId) bad("local_student_id", "unknown_student");
    if (!RELATIONSHIPS.has(rel)) bad("relationship", "invalid_relationship");
    if (!staffId || !studentId || !RELATIONSHIPS.has(rel) || staffId === session.staffId) return;

    const key = `${staffId}|${studentId}|${rel}`;
    if (seen.has(key)) return bad("local_student_id", "duplicate_in_file");
    seen.add(key);
    if (active.has(key)) {
      unchanged++;
      return;
    }
    creates++;
    writes.push(() =>
      c.query(
        `INSERT INTO caseload_assignment (id, tenant_id, staff_id, student_id, relationship, granted_by, start_date, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, ${SCHOOL_TODAY}, $6, $6)`,
        [uuidv7(), session.tenantId, staffId, studentId, rel, session.staffId],
      ),
    );
  });

  errors.sort((x, y) => x.row - y.row || x.field.localeCompare(y.field));
  const committed = input.commit && errors.length === 0;
  if (committed) for (const w of writes) await w();
  return { committed, rows: rows.length, creates, updates: 0, unchanged, errors };
}
