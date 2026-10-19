import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "@iep/db";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { FieldCrypto } from "../src/crypto/fields.ts";
import { createPool } from "../src/db.ts";
import type { AuditEvent, AuthDeps } from "../src/modules/auth/index.ts";
import { dbScopeResolver } from "../src/scope-resolver.ts";
import type { Session } from "../src/session.ts";

export const databaseUrl = process.env.DATABASE_URL;

// Stand-in for the real session verifier: the test names the session in a header. It
// exists only in test code and is passed to buildApp explicitly, so a running server never has it.
const testSessions: AuthDeps["sessions"] = {
  async verify(req) {
    const raw = req.headers["x-test-session"];
    if (typeof raw !== "string") return null;
    const s = JSON.parse(raw) as Session;
    return {
      principal: { ...s, active: true, aiEnabled: true },
      sessionId: "test-session",
      deviceId: "00000000-0000-4000-8000-000000000000",
    };
  },
};

/** Audit events recorded by the auth module during the test run. */
export const auditEvents: AuditEvent[] = [];

export const fieldKey = randomBytes(32).toString("base64");
export const crypto = FieldCrypto.fromBase64(fieldKey);

/** Makes the next `remaining` audit writes throw, to exercise fail-closed paths. */
export const auditFault = { remaining: 0 };

export async function testApp() {
  const config = loadConfig({
    IEP_DATA_CLASS: "synthetic",
    DATABASE_URL: databaseUrl,
    IEP_FIELD_KEY: fieldKey,
  });
  const db = createPool(databaseUrl!);
  const app = await buildApp(config, {
    sessions: testSessions,
    scopes: dbScopeResolver(db),
    audit: {
      record: async (e) => {
        if (auditFault.remaining > 0) {
          auditFault.remaining--;
          throw new Error("audit sink down");
        }
        auditEvents.push(e);
      },
    },
  });
  app.addHook("onClose", async () => {
    await db.end();
  });
  return app;
}

export const as = (s: Session) => ({ "x-test-session": JSON.stringify(s) });

/** A tenant with a school, a director, two case managers and fake students, seeded as the owner. */
export interface Fixture {
  tenantId: string;
  schoolId: string;
  director: Session;
  cmOne: Session;
  cmTwo: Session;
  students: { id: string; goalId: string; planId: string; iepId: string }[];
}

export async function seedTenant(client: pg.Client, label: string): Promise<Fixture> {
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const staff = (role: Session["role"]): Session => ({ tenantId, staffId: randomUUID(), role });
  const director = staff("sped_director");
  const cmOne = staff("case_manager");
  const cmTwo = staff("case_manager");
  const students: Fixture["students"] = [];

  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  await client.query("INSERT INTO tenant (id, name) VALUES ($1, $2)", [
    tenantId,
    `Synthetic ${label}`,
  ]);
  await client.query("INSERT INTO school (id, tenant_id, name) VALUES ($1, $2, $3)", [
    schoolId,
    tenantId,
    `${label} Elementary`,
  ]);
  for (const [i, s] of [director, cmOne, cmTwo].entries()) {
    await client.query(
      "INSERT INTO staff (id, tenant_id, email, display_name, role) VALUES ($1, $2, $3, $4, $5)",
      [s.staffId, tenantId, `staff${i}@${label}.example.test`, `Staff ${i}`, s.role],
    );
  }
  const names = [
    ["Ada", "Quill"],
    ["Ben", "Marsh"],
    ["Cy", "Okoye"],
  ] as const;
  for (const [i, [first, last]] of names.entries()) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO student (id, tenant_id, school_id, grade, first_name_enc, last_name_enc, name_bidx)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        tenantId,
        schoolId,
        String(i + 2),
        crypto.encrypt(tenantId, "student.first_name", id, first),
        crypto.encrypt(tenantId, "student.last_name", id, last),
        crypto.blindIndex(tenantId, "student.name", first, last),
      ],
    );
    const iepId = randomUUID();
    const goalId = randomUUID();
    const planId = randomUUID();
    await client.query(
      "INSERT INTO iep (id, tenant_id, student_id, type, effective_from) VALUES ($1, $2, $3, 'annual', '2026-09-01')",
      [iepId, tenantId, id],
    );
    await client.query(
      "INSERT INTO goal (id, tenant_id, iep_id, area, statement, sequence) VALUES ($1, $2, $3, 'reading', $4, 0)",
      [goalId, tenantId, iepId, `Fake goal ${i}`],
    );
    await client.query(
      "INSERT INTO measurement_plan (id, tenant_id, goal_id, type, trials_per_session) VALUES ($1, $2, $3, 'trials', 10)",
      [planId, tenantId, goalId],
    );
    students.push({ id, goalId, planId, iepId });
  }
  // cmOne has students 0 and 1; cmTwo has student 2. The director grants both.
  for (const [cm, idx] of [
    [cmOne, 0],
    [cmOne, 1],
    [cmTwo, 2],
  ] as const) {
    await client.query(
      `INSERT INTO caseload_assignment (id, tenant_id, staff_id, student_id, relationship, granted_by, start_date)
       VALUES ($1, $2, $3, $4, 'caseload', $5, '2026-08-01')`,
      [randomUUID(), tenantId, cm.staffId, students[idx]!.id, director.staffId],
    );
  }
  await client.query("COMMIT");
  return { tenantId, schoolId, director, cmOne, cmTwo, students };
}

export async function ownerClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await migrate(client);
  return client;
}
