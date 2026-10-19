// Integration tests for the read routes. Needs DATABASE_URL (CI has a Postgres service).
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as,
  crypto,
  databaseUrl,
  ownerClient,
  seedTenant,
  testApp,
  type Fixture,
} from "./helpers.ts";

it.runIf(!databaseUrl && process.env.CI)("has a database to test against in CI", () => {
  throw new Error("DATABASE_URL is not set in CI: the api integration tests did not run");
});

describe.skipIf(!databaseUrl)("read api", () => {
  let owner: pg.Client;
  let a: Fixture;
  let b: Fixture;
  let app: Awaited<ReturnType<typeof testApp>>;

  beforeAll(async () => {
    owner = await ownerClient();
    a = await seedTenant(owner, "alpha");
    b = await seedTenant(owner, "beta");
    app = await testApp();
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const get = (url: string, s: Fixture["director"]) =>
    app.inject({ method: "GET", url, headers: as(s) });

  it("needs a session", async () => {
    expect((await app.inject({ method: "GET", url: "/v0/students" })).statusCode).toBe(401);
  });

  it("returns the signed-in staff member", async () => {
    const res = await get("/v0/me", a.cmOne);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: a.cmOne.staffId, role: "case_manager" });
  });

  it("shows a case manager only their caseload, with decrypted S1 fields", async () => {
    const res = await get("/v0/students", a.cmOne);
    expect(res.statusCode).toBe(200);
    const students = (res.json().students as { id: string; display_name: string }[]).sort((x, y) =>
      x.display_name.localeCompare(y.display_name),
    );
    expect(students).toEqual([
      { id: a.students[0]!.id, school_id: a.schoolId, grade: "2", display_name: "Ada Q." },
      { id: a.students[1]!.id, school_id: a.schoolId, grade: "3", display_name: "Ben M." },
    ]);
  });

  it("shows the director every student in the tenant and nothing from another tenant", async () => {
    const res = await get("/v0/students", a.director);
    const ids = res.json().students.map((s: { id: string }) => s.id);
    expect(ids.sort()).toEqual(a.students.map((s) => s.id).sort());
    for (const s of b.students) expect(ids).not.toContain(s.id);
  });

  it("returns goals with measurement plans for a caseload student", async () => {
    const res = await get(`/v0/students/${a.students[0]!.id}/goals`, a.cmOne);
    expect(res.statusCode).toBe(200);
    const [goal] = res.json().goals;
    expect(goal).toMatchObject({ id: a.students[0]!.goalId, area: "reading", sequence: 0 });
    expect(goal.measurement_plans).toEqual([
      expect.objectContaining({
        id: a.students[0]!.planId,
        type: "trials",
        trials_per_session: 10,
      }),
    ]);
    expect(goal).not.toHaveProperty("condition");
  });

  it("answers 404, not 403, for a student outside the caseload or tenant", async () => {
    // cmOne has no assignment for student 2; tenant A staff asking for a tenant B student.
    for (const id of [a.students[2]!.id, b.students[0]!.id, "not-a-uuid"]) {
      const res = await get(`/v0/students/${id}/goals`, a.cmOne);
      expect(res.statusCode, id).toBe(404);
    }
  });

  it("gives IT admins no student data", async () => {
    const it_ = { ...a.cmOne, role: "district_it_admin" as const };
    // Cedar refuses the list outright, and the decision is audited.
    expect((await get("/v0/students", it_)).statusCode).toBe(403);
  });

  it("stops serving a staff member who was deactivated", async () => {
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
    await owner.query("UPDATE staff SET status = 'suspended' WHERE id = $1", [a.cmTwo.staffId]);
    await owner.query("COMMIT");
    expect((await get("/v0/me", a.cmTwo)).statusCode).toBe(401);
  });

  it("never stores names in plaintext", async () => {
    const res = await owner.query<{ first_name_enc: Buffer }>(
      "SELECT first_name_enc FROM student WHERE id = $1",
      [a.students[0]!.id],
    );
    expect(res.rows[0]!.first_name_enc.includes(Buffer.from("Ada"))).toBe(false);
    expect(
      crypto.decrypt(
        a.tenantId,
        "student.first_name",
        a.students[0]!.id,
        res.rows[0]!.first_name_enc,
      ),
    ).toBe("Ada");
  });

  it("skips a student whose ciphertext was swapped with another row's, and serves the rest", async () => {
    const t = await seedTenant(owner, "swap");
    const [one, two] = t.students;
    // Swap two same-tenant first names, as a bug or a bad migration might.
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [t.tenantId]);
    await owner.query(
      `UPDATE student a SET first_name_enc = b.first_name_enc FROM student b
       WHERE a.id = $1 AND b.id = $2`,
      [one!.id, two!.id],
    );
    await owner.query("COMMIT");
    const res = await get("/v0/students", t.director);
    expect(res.statusCode).toBe(200);
    const ids = (res.json().students as { id: string }[]).map((x) => x.id);
    expect(ids).not.toContain(one!.id);
    expect(ids).toContain(two!.id); // untouched student still served
    const feed = await get("/v0/sync/changes?since=0&limit=1000", t.director);
    expect(feed.statusCode).toBe(200);
    const fed = (feed.json().changes as { entity: string; id: string }[])
      .filter((c) => c.entity === "student")
      .map((c) => c.id);
    expect(fed).not.toContain(one!.id);
    expect(fed).toContain(two!.id);
  });
});
