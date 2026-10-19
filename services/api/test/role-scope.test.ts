import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as,
  auditEvents,
  auditFault,
  databaseUrl,
  ownerClient,
  seedTenant,
  testApp,
  type Fixture,
} from "./helpers.ts";

interface Change {
  entity: string;
  id: string;
  server_seq: number;
  deleted: boolean;
  row?: Record<string, unknown>;
}

// Security design section 3.3: gen-ed teachers and paraprofessionals read goal-level data only for
// goals delegated to them. Students (S1) and IEP shells (S2) follow their roster.
describe.skipIf(!databaseUrl)("role scope on goal data", () => {
  let owner: pg.Client;
  let f: Fixture;
  let app: Awaited<ReturnType<typeof testApp>>;
  const roles = ["gen_ed_teacher", "paraprofessional"] as const;

  beforeAll(async () => {
    owner = await ownerClient();
    f = await seedTenant(owner, "role-scope");
    app = await testApp();
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  async function tx(fn: () => Promise<void>) {
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [f.tenantId]);
    await fn();
    await owner.query("COMMIT");
  }
  async function newStaff(role: (typeof roles)[number], students: number[]) {
    const s = { tenantId: f.tenantId, staffId: randomUUID(), role };
    await tx(async () => {
      await owner.query(
        "INSERT INTO staff (id, tenant_id, email, display_name, role) VALUES ($1, $2, $3, 'X', $4)",
        [s.staffId, f.tenantId, `${s.staffId}@role-scope.example.test`, role],
      );
      for (const i of students) {
        await owner.query(
          "INSERT INTO caseload_assignment (id, tenant_id, staff_id, student_id, relationship, granted_by, start_date) VALUES ($1, $2, $3, $4, 'class_roster', $5, '2026-08-01')",
          [randomUUID(), f.tenantId, s.staffId, f.students[i]!.id, f.cmOne.staffId],
        );
      }
    });
    return s;
  }
  const delegate = (staffId: string, goalId: string) =>
    tx(async () => {
      await owner.query(
        "INSERT INTO goal_delegation (id, tenant_id, goal_id, staff_id, granted_by) VALUES ($1, $2, $3, $4, $5)",
        [randomUUID(), f.tenantId, goalId, staffId, f.cmOne.staffId],
      );
    });
  async function pull(
    s: { tenantId: string; staffId: string; role: (typeof roles)[number] },
    since = 0,
  ) {
    const res = await app.inject({
      method: "GET",
      url: `/v0/sync/changes?since=${since}&limit=500`,
      headers: as(s),
    });
    expect(res.statusCode).toBe(200);
    return res.json() as { changes: Change[]; cursor: number };
  }
  const ids = (cs: Change[], e: string) =>
    cs.filter((c) => c.entity === e && !c.deleted).map((c) => c.id);

  it.each(roles)(
    "%s gets students and IEPs, but no goal data until a goal is delegated",
    async (role) => {
      const s = await newStaff(role, [0, 1]);
      const { changes } = await pull(s);
      expect(ids(changes, "student")).toHaveLength(2);
      expect(ids(changes, "iep")).toHaveLength(2);
      for (const e of ["goal", "objective", "measurement_plan", "data_point"]) {
        expect(ids(changes, e)).toEqual([]);
      }
      const res = await app.inject({
        method: "GET",
        url: `/v0/students/${f.students[0]!.id}/goals`,
        headers: as(s),
      });
      expect(res.json()).toEqual({ goals: [] });
    },
  );

  it.each(roles)(
    "%s receives only the delegated goal, with its plan, and nothing for other goals",
    async (role) => {
      const s = await newStaff(role, [0, 1]);
      await delegate(s.staffId, f.students[0]!.goalId);
      const { changes } = await pull(s);
      expect(ids(changes, "goal")).toEqual([f.students[0]!.goalId]);
      expect(ids(changes, "measurement_plan")).toEqual([f.students[0]!.planId]);
      expect(ids(changes, "goal_delegation")).toHaveLength(1);
      const res = await app.inject({
        method: "GET",
        url: `/v0/students/${f.students[0]!.id}/goals`,
        headers: as(s),
      });
      expect((res.json().goals as { id: string }[]).map((g) => g.id)).toEqual([
        f.students[0]!.goalId,
      ]);
      const other = await app.inject({
        method: "GET",
        url: `/v0/students/${f.students[1]!.id}/goals`,
        headers: as(s),
      });
      expect(other.json()).toEqual({ goals: [] });
    },
  );

  it("re-sends a goal's older rows when it is delegated later, and a tombstone when delegation is revoked", async () => {
    const s = await newStaff("paraprofessional", [0]);
    const first = await pull(s);
    expect(ids(first.changes, "goal")).toEqual([]);
    await delegate(s.staffId, f.students[0]!.goalId);
    const second = await pull(s, first.cursor);
    expect(ids(second.changes, "goal")).toEqual([f.students[0]!.goalId]);
    await tx(async () => {
      await owner.query("UPDATE goal_delegation SET deleted_at = now() WHERE staff_id = $1", [
        s.staffId,
      ]);
    });
    const third = await pull(s, second.cursor);
    expect(third.changes.filter((c) => c.entity === "goal_delegation" && c.deleted)).toHaveLength(
      1,
    );
    expect(ids(third.changes, "goal")).toEqual([]);
    const res = await app.inject({
      method: "GET",
      url: `/v0/students/${f.students[0]!.id}/goals`,
      headers: as(s),
    });
    expect(res.json()).toEqual({ goals: [] });
  });

  it("an expired delegation stops delivering the goal", async () => {
    const s = await newStaff("gen_ed_teacher", [0]);
    await tx(async () => {
      await owner.query(
        "INSERT INTO goal_delegation (id, tenant_id, goal_id, staff_id, granted_by, expires_at) VALUES ($1, $2, $3, $4, $5, now() - interval '1 hour')",
        [randomUUID(), f.tenantId, f.students[0]!.goalId, s.staffId, f.cmOne.staffId],
      );
    });
    expect(ids((await pull(s)).changes, "goal")).toEqual([]);
  });

  it("case managers and directors still get every goal of their visible students", async () => {
    const cm = await app.inject({
      method: "GET",
      url: "/v0/sync/changes?since=0&limit=500",
      headers: as(f.cmOne),
    });
    const goals = (cm.json().changes as Change[])
      .filter((c) => c.entity === "goal")
      .map((c) => c.id);
    expect(goals.sort()).toEqual([f.students[0]!.goalId, f.students[1]!.goalId].sort());
  });

  it("sends delegated-only roles the goal text but not the S4 detail, and audits the decisions", async () => {
    await tx(async () => {
      await owner.query("UPDATE goal SET criteria = '80 percent' WHERE id = $1", [
        f.students[0]!.goalId,
      ]);
    });
    const para = await newStaff("paraprofessional", [0]);
    await delegate(para.staffId, f.students[0]!.goalId);
    const { changes } = await pull(para);
    const goal = changes.find((c) => c.entity === "goal")!;
    expect(goal.row).toMatchObject({ statement: "Fake goal 0", area: "reading" });
    expect(goal.row).not.toHaveProperty("criteria");
    expect(JSON.stringify(changes)).not.toContain('"scope"');
    const cm = (
      await app.inject({
        method: "GET",
        url: "/v0/sync/changes?since=0&limit=500",
        headers: as(f.cmOne),
      })
    ).json();
    expect(
      (cm.changes as Change[]).find((c) => c.id === f.students[0]!.goalId)!.row,
    ).toHaveProperty("criteria", "80 percent");
    expect(
      auditEvents.some(
        (e) => e.actorId === para.staffId && e.action === "ReadSection" && e.outcome === "allow",
      ),
    ).toBe(true);
  });

  it("answers 503 for the whole page when an authorization decision errors, and the retry returns it all", async () => {
    const cm = f.cmOne;
    const url = "/v0/sync/changes?since=0&limit=500";
    const full = (await app.inject({ method: "GET", url, headers: as(cm) })).json();
    expect((full.changes as Change[]).length).toBeGreaterThan(0);
    auditFault.remaining = 1;
    const failed = await app.inject({ method: "GET", url, headers: as(cm) });
    auditFault.remaining = 0;
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).not.toHaveProperty("changes");
    const retry = (await app.inject({ method: "GET", url, headers: as(cm) })).json();
    expect(retry.changes).toEqual(full.changes);
  });

  it("a snapshot transaction does not see rows committed after its first query", async () => {
    const { createPool, withTenant } = await import("../src/db.ts");
    const db = createPool(databaseUrl!);
    try {
      const seen = await withTenant(
        db,
        f.cmOne,
        async (c) => {
          const before = await c.query("SELECT count(*)::int AS n FROM goal");
          await tx(async () => {
            await owner.query(
              "INSERT INTO goal (id, tenant_id, iep_id, area, statement, sequence) SELECT $1, tenant_id, iep_id, area, 'late', 99 FROM goal WHERE id = $2",
              [randomUUID(), f.students[0]!.goalId],
            );
          });
          const after = await c.query("SELECT count(*)::int AS n FROM goal");
          return [before.rows[0].n, after.rows[0].n];
        },
        { snapshot: true },
      );
      expect(seen[1]).toBe(seen[0]);
    } finally {
      await db.end();
    }
  });
});
