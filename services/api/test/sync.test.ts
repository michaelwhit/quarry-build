// Integration tests for sync push and the change feed. Needs DATABASE_URL.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, databaseUrl, ownerClient, seedTenant, testApp, type Fixture } from "./helpers.ts";

type Change = {
  entity: string;
  id: string;
  server_seq: number;
  deleted: boolean;
  row?: Record<string, unknown>;
};

describe.skipIf(!databaseUrl)("sync", () => {
  let owner: pg.Client;
  let a: Fixture;
  let b: Fixture;
  let app: Awaited<ReturnType<typeof testApp>>;

  beforeAll(async () => {
    owner = await ownerClient();
    a = await seedTenant(owner, "sync-alpha");
    b = await seedTenant(owner, "sync-beta");
    app = await testApp();
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  // Recorded a few hours ago: the server refuses a device clock more than 14 days behind, so fixed
  // calendar dates here would start failing once they age past that.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const point = (f: Fixture, who: Fixture["cmOne"], device: string, idx = 0, extra = {}) => ({
    id: randomUUID(),
    goal_id: f.students[idx]!.goalId,
    plan_id: f.students[idx]!.planId,
    observed_at: hoursAgo(3),
    correct: 7,
    total: 10,
    collector_id: who.staffId,
    device_id: device,
    client_created_at: hoursAgo(2.9),
    ...extra,
  });
  const push = (s: Fixture["cmOne"], device: string, points: object[]) =>
    app.inject({
      method: "POST",
      url: "/v0/sync/push",
      headers: as(s),
      payload: {
        device_id: device,
        mutations: points.map((p) => ({
          idempotency_key: randomUUID(),
          entity: "data_point",
          op: "insert",
          payload: p,
        })),
      },
    });
  async function pullAll(s: Fixture["cmOne"], since = 0, limit = 500) {
    const changes: Change[] = [];
    let cursor = since;
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({
        method: "GET",
        url: `/v0/sync/changes?since=${cursor}&limit=${limit}`,
        headers: as(s),
      });
      expect(res.statusCode).toBe(200);
      const page = res.json() as { changes: Change[]; cursor: number; has_more: boolean };
      changes.push(...page.changes);
      expect(page.cursor).toBeGreaterThanOrEqual(cursor);
      cursor = page.cursor;
      if (!page.has_more) return { changes, cursor };
    }
    throw new Error("sync did not terminate");
  }
  const ofEntity = (cs: Change[], e: string) => cs.filter((c) => c.entity === e);

  it("applies a pushed point once and treats a retry as applied, not duplicated", async () => {
    const device = randomUUID();
    const p = point(a, a.cmOne, device);
    const first = await push(a.cmOne, device, [p]);
    expect(first.json().results[0].status).toBe("applied");
    const retry = await push(a.cmOne, device, [p]);
    expect(retry.json().results[0].status).toBe("applied");
    const count = await owner.query("SELECT count(*) FROM data_point WHERE id = $1", [p.id]);
    expect(count.rows[0].count).toBe("1");
  });

  it("reports a different point claiming a taken id as a conflict", async () => {
    const device = randomUUID();
    const p = point(a, a.cmOne, device);
    await push(a.cmOne, device, [p]);
    const res = await push(a.cmOne, device, [{ ...p, client_created_at: hoursAgo(2) }]);
    expect(res.json().results[0].status).toBe("conflict");
  });

  it("rejects points the caller may not write, with reasons that carry no data", async () => {
    const device = randomUUID();
    const cases: [string, object, Fixture["cmOne"]][] = [
      [
        "collector_mismatch",
        point(a, a.cmOne, device, 0, { collector_id: a.cmTwo.staffId }),
        a.cmOne,
      ],
      ["device_mismatch", point(a, a.cmOne, randomUUID()), a.cmOne],
      ["unknown_goal", point(a, a.cmOne, device, 2), a.cmOne], // student 2 is cmTwo's
      ["unknown_goal", { ...point(a, a.cmOne, device), goal_id: b.students[0]!.goalId }, a.cmOne],
      ["unknown_plan", point(a, a.cmOne, device, 0, { plan_id: a.students[1]!.planId }), a.cmOne],
      ["correct_exceeds_total", point(a, a.cmOne, device, 0, { correct: 11 }), a.cmOne],
      ["invalid_note", point(a, a.cmOne, device, 0, { note: "x".repeat(2001) }), a.cmOne],
      [
        "role_cannot_record",
        point(a, a.cmOne, device, 0, { collector_id: a.director.staffId }),
        a.director,
      ],
    ];
    for (const [reason, p, who] of cases) {
      const body = p as { device_id: string };
      const res = await push(who, who === a.director ? body.device_id : device, [p]);
      const r = res.json().results[0];
      expect(r.status, reason).toBe("rejected");
      expect(r.reason, reason).toBe(reason);
    }
  });

  it("lets a delegated paraprofessional record only for delegated goals", async () => {
    const para = { tenantId: a.tenantId, staffId: randomUUID(), role: "paraprofessional" as const };
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
    await owner.query(
      "INSERT INTO staff (id, tenant_id, email, display_name, role) VALUES ($1, $2, $3, 'Para', 'paraprofessional')",
      [para.staffId, a.tenantId, `para@${a.tenantId}.example.test`],
    );
    for (const s of [0, 1]) {
      await owner.query(
        "INSERT INTO caseload_assignment (id, tenant_id, staff_id, student_id, relationship, granted_by, start_date) VALUES ($1, $2, $3, $4, 'class_roster', $5, '2026-08-01')",
        [randomUUID(), a.tenantId, para.staffId, a.students[s]!.id, a.cmOne.staffId],
      );
    }
    await owner.query(
      "INSERT INTO goal_delegation (id, tenant_id, goal_id, staff_id, granted_by, created_at) VALUES ($1, $2, $3, $4, $5, '2026-09-01T00:00:00Z')",
      [randomUUID(), a.tenantId, a.students[0]!.goalId, para.staffId, a.cmOne.staffId],
    );
    await owner.query("COMMIT");
    const device = randomUUID();
    const ok = await push(para, device, [point(a, para, device, 0)]);
    expect(ok.json().results[0].status).toBe("applied");
    const no = await push(para, device, [point(a, para, device, 1)]);
    expect(no.json().results[0]).toMatchObject({
      status: "rejected",
      reason: "goal_not_delegated",
    });
  });

  it("converges two devices that record offline, then both sync", async () => {
    const phone = randomUUID();
    const mac = randomUUID();
    const fromPhone = [point(a, a.cmOne, phone, 0), point(a, a.cmOne, phone, 1)];
    const fromMac = [point(a, a.cmOne, mac, 0)];
    // Both push after being offline, in either order, and a dropped response is retried.
    await push(a.cmOne, mac, fromMac);
    await push(a.cmOne, phone, fromPhone);
    await push(a.cmOne, phone, fromPhone);
    const sent = new Set([...fromPhone, ...fromMac].map((p) => p.id));

    const one = await pullAll(a.cmOne);
    const two = await pullAll(a.cmOne);
    for (const pulled of [one, two]) {
      const ids = ofEntity(pulled.changes, "data_point").map((c) => c.id);
      for (const id of sent) expect(ids.filter((x) => x === id)).toHaveLength(1);
    }
    expect(one.changes).toEqual(two.changes);
  });

  it("pages without losing or repeating a change, whatever the page size", async () => {
    const whole = await pullAll(a.cmOne, 0, 1000);
    for (const limit of [1, 2, 3, 7]) {
      const paged = await pullAll(a.cmOne, 0, limit);
      expect(paged.changes.map((c) => `${c.entity}:${c.id}`)).toEqual(
        whole.changes.map((c) => `${c.entity}:${c.id}`),
      );
      expect(paged.cursor).toBe(whole.cursor);
    }
  });

  it("returns only S1 student fields and nothing outside the caseload or tenant", async () => {
    const { changes } = await pullAll(a.cmOne);
    const students = ofEntity(changes, "student");
    expect(students.map((s) => s.id).sort()).toEqual([a.students[0]!.id, a.students[1]!.id].sort());
    for (const s of students) {
      expect(Object.keys(s.row!).sort()).toEqual(["display_name", "grade", "school_id"]);
    }
    const allowed = new Set([a.students[0]!.goalId, a.students[1]!.goalId]);
    for (const c of ofEntity(changes, "data_point"))
      expect(allowed.has(c.row!.goal_id as string)).toBe(true);
    const json = JSON.stringify(changes);
    for (const s of b.students) expect(json).not.toContain(s.id);
    expect(json).not.toContain(a.students[2]!.id);
  });

  it("lets the director pull the whole tenant, including every assignment", async () => {
    const { changes } = await pullAll(a.director);
    expect(ofEntity(changes, "student")).toHaveLength(3);
    const staff = new Set(ofEntity(changes, "caseload_assignment").map((c) => c.row!.staff_id));
    expect(staff).toEqual(new Set([a.cmOne.staffId, a.cmTwo.staffId, expect.any(String)]));
    const own = ofEntity((await pullAll(a.cmOne)).changes, "caseload_assignment");
    expect(own.length).toBeGreaterThan(0);
    for (const c of own) expect(c.row!.staff_id).toBe(a.cmOne.staffId);
  });

  it("sends a student's existing rows when they join a caseload, and a tombstone when they leave", async () => {
    const { cursor } = await pullAll(a.cmOne);
    // Director adds student 2 to cmOne's caseload; the student's older rows have lower seqs.
    const assignment = randomUUID();
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
    await owner.query(
      "INSERT INTO caseload_assignment (id, tenant_id, staff_id, student_id, relationship, granted_by, start_date) VALUES ($1, $2, $3, $4, 'service', $5, '2026-08-01')",
      [assignment, a.tenantId, a.cmOne.staffId, a.students[2]!.id, a.director.staffId],
    );
    await owner.query("COMMIT");

    const joined = await pullAll(a.cmOne, cursor, 2);
    expect(ofEntity(joined.changes, "student").map((c) => c.id)).toEqual([a.students[2]!.id]);
    expect(ofEntity(joined.changes, "goal").map((c) => c.id)).toEqual([a.students[2]!.goalId]);
    expect(ofEntity(joined.changes, "measurement_plan")).toHaveLength(1);
    expect(ofEntity(joined.changes, "caseload_assignment")).toHaveLength(1);

    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
    await owner.query("UPDATE caseload_assignment SET deleted_at = now() WHERE id = $1", [
      assignment,
    ]);
    await owner.query("COMMIT");
    const left = await pullAll(a.cmOne, joined.cursor);
    expect(left.changes).toEqual([
      expect.objectContaining({ entity: "caseload_assignment", id: assignment, deleted: true }),
    ]);
  });

  it("sends a tombstone when a goal is deleted", async () => {
    const { cursor } = await pullAll(a.cmOne);
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
    await owner.query("UPDATE goal SET deleted_at = now() WHERE id = $1", [a.students[1]!.goalId]);
    await owner.query("COMMIT");
    const { changes } = await pullAll(a.cmOne, cursor);
    expect(changes).toEqual([
      expect.objectContaining({ entity: "goal", id: a.students[1]!.goalId, deleted: true }),
    ]);
    expect(changes[0]).not.toHaveProperty("row");
  });

  it("validates sync requests and refuses roles that hold no student data", async () => {
    const h = as(a.cmOne);
    for (const url of [
      "/v0/sync/changes",
      "/v0/sync/changes?since=-1",
      "/v0/sync/changes?since=x",
      "/v0/sync/changes?since=0&limit=0",
      "/v0/sync/changes?since=0&limit=1001",
    ]) {
      expect((await app.inject({ method: "GET", url, headers: h })).statusCode, url).toBe(400);
    }
    const bad = await app.inject({
      method: "POST",
      url: "/v0/sync/push",
      headers: h,
      payload: { device_id: "nope", mutations: [] },
    });
    expect(bad.statusCode).toBe(400);
    const it_ = { ...a.cmOne, role: "district_it_admin" as const };
    expect(
      (await app.inject({ method: "GET", url: "/v0/sync/changes?since=0", headers: as(it_) }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v0/sync/push",
          headers: as(it_),
          payload: { device_id: randomUUID(), mutations: [] },
        })
      ).statusCode,
    ).toBe(403);
    const res = await app.inject({
      method: "POST",
      url: "/v0/sync/push",
      headers: h,
      payload: {
        device_id: randomUUID(),
        mutations: [{ idempotency_key: randomUUID(), entity: "goal", op: "insert", payload: {} }],
      },
    });
    expect(res.json().results[0]).toMatchObject({
      status: "rejected",
      reason: "unsupported_mutation",
    });
  });

  it("never lets a reader skip a change that commits late (ordered change feed)", async () => {
    // Two writers interleave: A starts first and takes its seq, B starts second. With the
    // advisory lock B waits for A, so B's seq is higher and committed after A's.
    const c1 = new pg.Client({ connectionString: databaseUrl });
    const c2 = new pg.Client({ connectionString: databaseUrl });
    await Promise.all([c1.connect(), c2.connect()]);
    const upd = (c: pg.Client, goalId: string) =>
      c.query("UPDATE goal SET baseline = 'x' WHERE id = $1", [goalId]);
    try {
      for (const c of [c1, c2]) {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
      }
      await upd(c1, a.students[0]!.goalId);
      const second = upd(c2, a.students[2]!.goalId); // blocks on the lock until c1 commits
      let settled = false;
      void second.then(() => (settled = true));
      await new Promise((r) => setTimeout(r, 150));
      // Without the lock B would already hold a higher seq and could commit before A.
      expect(settled).toBe(false);
      await c1.query("COMMIT");
      await second;
      await c2.query("COMMIT");
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
    const seqs = await owner.query<{ id: string; server_seq: string }>(
      "SELECT id, server_seq FROM goal WHERE id = ANY($1) ORDER BY server_seq",
      [[a.students[0]!.goalId, a.students[2]!.goalId]],
    );
    expect(seqs.rows.map((r) => r.id)).toEqual([a.students[0]!.goalId, a.students[2]!.goalId]);
  });

  describe("meaning checks and corrections", () => {
    const rejectedReason = async (who: Fixture["cmOne"], device: string, p: object) =>
      (await push(who, device, [p])).json().results[0] as { status: string; reason?: string };

    it("rejects values that do not fit the plan, and future timestamps", async () => {
      const device = randomUUID();
      const cases: [string, object][] = [
        [
          "total_exceeds_trials_per_session",
          point(a, a.cmOne, device, 0, { total: 11, correct: 3 }),
        ],
        ["missing_value", point(a, a.cmOne, device, 0, { correct: undefined })],
        [
          "client_clock_ahead",
          point(a, a.cmOne, device, 0, { client_created_at: "2999-01-01T00:00:00Z" }),
        ],
        [
          "client_clock_behind",
          point(a, a.cmOne, device, 0, {
            client_created_at: new Date(Date.now() - 15 * 86_400_000).toISOString(),
          }),
        ],
        [
          "observed_in_future",
          point(a, a.cmOne, device, 0, { observed_at: "2999-01-01T00:00:00Z" }),
        ],
      ];
      for (const [reason, p] of cases) {
        const r = await rejectedReason(a.cmOne, device, p);
        expect(r, reason).toMatchObject({ status: "rejected", reason });
      }
    });

    it("judges delegation as of the recording time, not the sync time", async () => {
      const para = {
        tenantId: a.tenantId,
        staffId: randomUUID(),
        role: "paraprofessional" as const,
      };
      // Valid from 10 to 4 days ago, relative to now so the 14-day offline bound never bites.
      const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
      await owner.query("BEGIN");
      await owner.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
      await owner.query(
        "INSERT INTO staff (id, tenant_id, email, display_name, role) VALUES ($1, $2, $3, 'Para2', 'paraprofessional')",
        [para.staffId, a.tenantId, `para2@${a.tenantId}.example.test`],
      );
      await owner.query(
        "INSERT INTO caseload_assignment (id, tenant_id, staff_id, student_id, relationship, granted_by, start_date) VALUES ($1, $2, $3, $4, 'class_roster', $5, '2026-08-01')",
        [randomUUID(), a.tenantId, para.staffId, a.students[0]!.id, a.cmOne.staffId],
      );
      // Recorded while the delegation was valid, synced after it expired.
      await owner.query(
        "INSERT INTO goal_delegation (id, tenant_id, goal_id, staff_id, granted_by, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          randomUUID(),
          a.tenantId,
          a.students[0]!.goalId,
          para.staffId,
          a.cmOne.staffId,
          day(-10),
          day(-4),
        ],
      );
      await owner.query("COMMIT");
      const device = randomUUID();
      const inWindow = point(a, para, device, 0, {
        client_created_at: day(-7),
        observed_at: day(-7),
      });
      const after = point(a, para, device, 0, { client_created_at: day(-3) });
      const before = point(a, para, device, 0, {
        client_created_at: day(-11),
        observed_at: day(-11),
      });
      expect((await rejectedReason(para, device, inWindow)).status).toBe("applied");
      expect(await rejectedReason(para, device, after)).toMatchObject({
        reason: "goal_not_delegated",
      });
      expect(await rejectedReason(para, device, before)).toMatchObject({
        reason: "goal_not_delegated",
      });
    });

    it("lets only the original collector or a case manager correct a point", async () => {
      const dev = randomUUID();
      const original = point(a, a.cmOne, dev, 0);
      await push(a.cmOne, dev, [original]);
      // A second recorder on the same goal (related service provider) may not supersede it.
      const rsp = {
        tenantId: a.tenantId,
        staffId: randomUUID(),
        role: "related_service_provider" as const,
      };
      await owner.query("BEGIN");
      await owner.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
      await owner.query(
        "INSERT INTO staff (id, tenant_id, email, display_name, role) VALUES ($1, $2, $3, 'Rsp', 'related_service_provider')",
        [rsp.staffId, a.tenantId, `rsp@${a.tenantId}.example.test`],
      );
      await owner.query(
        "INSERT INTO caseload_assignment (id, tenant_id, staff_id, student_id, relationship, granted_by, start_date) VALUES ($1, $2, $3, $4, 'service', $5, '2026-08-01')",
        [randomUUID(), a.tenantId, rsp.staffId, a.students[0]!.id, a.cmOne.staffId],
      );
      await owner.query("COMMIT");
      const rspDev = randomUUID();
      expect(
        await rejectedReason(rsp, rspDev, point(a, rsp, rspDev, 0, { corrects_id: original.id })),
      ).toMatchObject({
        reason: "correction_not_allowed",
      });
      const own = point(a, a.cmOne, dev, 0, { corrects_id: original.id });
      expect((await rejectedReason(a.cmOne, dev, own)).status).toBe("applied");
    });

    it("answers a malformed entry with a per-entry rejection and a bad key with 400 before anything commits", async () => {
      const device = randomUUID();
      const good = point(a, a.cmOne, device, 0);
      const res = await app.inject({
        method: "POST",
        url: "/v0/sync/push",
        headers: as(a.cmOne),
        payload: {
          device_id: device,
          mutations: [
            { idempotency_key: randomUUID(), entity: "data_point", op: "insert", payload: good },
            {
              idempotency_key: randomUUID(),
              entity: "data_point",
              op: "insert",
              payload: { id: "nope" },
            },
          ],
        },
      });
      expect(res.json().results.map((r: { status: string }) => r.status)).toEqual([
        "applied",
        "rejected",
      ]);
      const bad = await app.inject({
        method: "POST",
        url: "/v0/sync/push",
        headers: as(a.cmOne),
        payload: {
          device_id: device,
          mutations: [
            {
              idempotency_key: randomUUID(),
              entity: "data_point",
              op: "insert",
              payload: point(a, a.cmOne, device, 0),
            },
            { idempotency_key: "not-a-uuid", entity: "data_point", op: "insert", payload: {} },
          ],
        },
      });
      expect(bad.statusCode).toBe(400);
      const count = await owner.query("SELECT count(*) FROM data_point WHERE goal_id = $1", [
        a.students[0]!.goalId,
      ]);
      expect(Number(count.rows[0].count)).toBeGreaterThan(0);
    });
  });

  it("mixed writers on the change feed never deadlock", async () => {
    const dev = randomUUID();
    const csv = `Student_Number,First_Name,Last_Name,Grade_Level,School_Name\n${Array.from({ length: 25 }, (_, i) => `SYN-9${i},Kit${i},Lane${i},3,sync-alpha Elementary`).join("\n")}`;
    const jobs: Promise<{ statusCode: number }>[] = [];
    for (let i = 0; i < 6; i++) {
      jobs.push(push(a.cmOne, dev, [point(a, a.cmOne, dev, 0), point(a, a.cmOne, dev, 1)]));
      jobs.push(
        app.inject({
          method: "POST",
          url: "/v0/imports/students",
          headers: as(a.director),
          payload: { csv: i === 0 ? csv : csv.replace(/Kit/g, `Kat${i}`), commit: true },
        }),
      );
      jobs.push(
        app.inject({
          method: "POST",
          url: `/v0/schools/${a.schoolId}/calendar`,
          headers: as(a.director),
          payload: {
            school_year: "2026-27",
            dates: [`2027-02-${String(10 + i).padStart(2, "0")}`],
          },
        }),
      );
      jobs.push(
        owner.query("UPDATE goal SET baseline = $2 WHERE id = $1", [
          a.students[1]!.goalId,
          `b${i}`,
        ]) as unknown as Promise<{ statusCode: number }>,
      );
    }
    // The owner connection is a single client, so its updates queue; the api requests overlap.
    const results = await Promise.all(jobs);
    for (const r of results) if ("statusCode" in r) expect(r.statusCode).toBeLessThan(500);
  });
});
