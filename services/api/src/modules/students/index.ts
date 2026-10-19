import { authzFor } from "../auth/endpoints.ts";
import type { FastifyPluginAsync } from "fastify";
import type { FieldCrypto } from "../../crypto/fields.ts";
import { withTenant, type Db } from "../../db.ts";
import { visibleStudentsCte } from "../../scope.ts";
import { requireSession } from "../../session.ts";

interface Opts {
  db: Db;
  crypto: FieldCrypto;
}

export const studentsModule: FastifyPluginAsync<Opts> = async (app, { db, crypto }) => {
  app.get("/v0/students", { config: { authz: authzFor("listStudents") } }, async (req) => {
    const session = requireSession(req);
    const rows = await withTenant(db, session, async (c) => {
      const res = await c.query<{
        id: string;
        school_id: string;
        grade: string;
        first_name_enc: Buffer;
        last_name_enc: Buffer;
        preferred_name_enc: Buffer | null;
      }>(
        `WITH ${visibleStudentsCte(session)}
         SELECT s.id, s.school_id, s.grade, s.first_name_enc, s.last_name_enc, s.preferred_name_enc
         FROM student s JOIN vis ON vis.student_id = s.id
         WHERE s.deleted_at IS NULL ORDER BY s.id`,
        [session.staffId],
      );
      return res.rows;
    });
    // S1 fields only: the preferred name, or first name and last initial.
    const students = [];
    for (const r of rows) {
      const display_name = safeDisplayName(req.log, crypto, session.tenantId, r);
      if (display_name !== undefined) {
        students.push({ id: r.id, school_id: r.school_id, grade: r.grade, display_name });
      }
    }
    return { students };
  });
};

/** Throws if any ciphertext fails to authenticate; callers decide how to isolate that. */
export function displayName(
  crypto: FieldCrypto,
  tenantId: string,
  r: {
    id: string;
    first_name_enc: Buffer;
    last_name_enc: Buffer;
    preferred_name_enc: Buffer | null;
  },
): string {
  if (r.preferred_name_enc) {
    return crypto.decrypt(tenantId, "student.preferred_name", r.id, r.preferred_name_enc);
  }
  const first = crypto.decrypt(tenantId, "student.first_name", r.id, r.first_name_enc);
  const last = crypto.decrypt(tenantId, "student.last_name", r.id, r.last_name_enc);
  return `${first} ${[...last][0] ?? ""}.`.trim();
}

/**
 * Display name, or undefined when the row fails to decrypt. One tampered or corrupt row must not
 * take down the list for everyone who can see it: the row is skipped and its id (never its
 * content) is logged.
 */
export function safeDisplayName(
  log: { error: (obj: object, msg: string) => void },
  crypto: FieldCrypto,
  tenantId: string,
  r: Parameters<typeof displayName>[2],
): string | undefined {
  try {
    return displayName(crypto, tenantId, r);
  } catch {
    log.error({ studentId: r.id }, "student name failed to decrypt; row skipped");
    return undefined;
  }
}
