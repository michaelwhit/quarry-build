// Integration tests for SRS report dates, the district calendar and the NDE goal fields.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, databaseUrl, ownerClient, seedTenant, testApp, type Fixture } from "./helpers.ts";

describe.skipIf(!databaseUrl)("calendar and NDE fields", () => {
  let owner: pg.Client;
  let f: Fixture;
  let other: Fixture;
  let app: Awaited<ReturnType<typeof testApp>>;

  beforeAll(async () => {
    owner = await ownerClient();
    f = await seedTenant(owner, "cal-alpha");
    other = await seedTenant(owner, "cal-beta");
    app = await testApp();
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const post = (path: string, who: Fixture["director"], payload: object) =>
    app.inject({ method: "POST", url: path, headers: as(who), payload });
  const periods = (id = f.schoolId) => `/v0/schools/${id}/reporting-periods`;

  it("adds SRS report dates once and reports what already existed", async () => {
    const body = {
      school_year: "2026-27",
      dates: ["2026-10-30", "2027-01-15", "2027-03-26", "2027-05-21"],
    };
    expect((await post(periods(), f.director, body)).json()).toEqual({ added: 4, existing: 0 });
    expect(
      (await post(periods(), f.director, { ...body, dates: [...body.dates, "2027-05-28"] })).json(),
    ).toEqual({
      added: 1,
      existing: 4,
    });
  });

  it("adds instructional days and ties the report dates into the sync feed", async () => {
    const days = ["2026-08-19", "2026-08-20", "2026-08-21"];
    expect(
      (
        await post(`/v0/schools/${f.schoolId}/calendar`, f.director, {
          school_year: "2026-27",
          dates: days,
        })
      ).json(),
    ).toEqual({
      added: 3,
      existing: 0,
    });
    const feed = await app.inject({
      method: "GET",
      url: "/v0/sync/changes?since=0&limit=1000",
      headers: as(f.cmOne),
    });
    const entities = (
      feed.json().changes as { entity: string; row?: Record<string, unknown> }[]
    ).filter((c) => c.entity === "reporting_period" || c.entity === "district_calendar");
    expect(entities.filter((c) => c.entity === "reporting_period")).toHaveLength(5);
    expect(entities.filter((c) => c.entity === "district_calendar")).toHaveLength(3);
    expect(entities[0]!.row).toMatchObject({ school_year: "2026-27" });
  });

  it("rejects bad years, dates outside the year, duplicates-as-garbage and other roles", async () => {
    const bad: object[] = [
      { school_year: "2026-28", dates: ["2026-10-30"] },
      { school_year: "2026-27", dates: ["2026-07-31"] },
      { school_year: "2026-27", dates: ["2027-08-01"] },
      { school_year: "2026-27", dates: ["2026-02-30"] },
      { school_year: "2026-27", dates: ["10/30/2026"] },
      { school_year: "2026-27", dates: [] },
      { school_year: "2026-27", dates: Array.from({ length: 401 }, () => "2026-10-30") },
      { school_year: "2026-27" },
    ];
    for (const b of bad)
      expect(
        (await post(periods(), f.director, b)).statusCode,
        JSON.stringify(b).slice(0, 60),
      ).toBe(400);
    const ok = { school_year: "2026-27", dates: ["2026-10-30"] };
    expect((await post(periods(), f.cmOne, ok)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: periods(), payload: ok })).statusCode).toBe(
      401,
    );
  });

  it("answers 404 for a school in another tenant or one that does not exist", async () => {
    const ok = { school_year: "2026-27", dates: ["2026-10-30"] };
    expect((await post(periods(other.schoolId), f.director, ok)).statusCode).toBe(404);
    expect((await post(periods(randomUUID()), f.director, ok)).statusCode).toBe(404);
    expect((await post(periods("nope"), f.director, ok)).statusCode).toBe(404);
  });

  it("serves the NDE goal fields through the goals route and the feed", async () => {
    const s = f.students[0]!;
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [f.tenantId]);
    await owner.query(
      `UPDATE goal SET condition = 'Given a grade 2 passage', behavior = 'Ada will read aloud',
         criteria = '90 percent accuracy in 4 of 5 trials', evaluation_method = 'Weekly probe',
         schedule = '2x weekly', standard_refs = ARRAY['RL.2.1'], srs_goal_order = 2,
         is_transition_related = false WHERE id = $1`,
      [s.goalId],
    );
    await owner.query("COMMIT");
    const res = await app.inject({
      method: "GET",
      url: `/v0/students/${s.id}/goals`,
      headers: as(f.cmOne),
    });
    expect(res.json().goals[0]).toMatchObject({
      condition: "Given a grade 2 passage",
      behavior: "Ada will read aloud",
      evaluation_method: "Weekly probe",
      schedule: "2x weekly",
      standard_refs: ["RL.2.1"],
      srs_goal_order: 2,
      is_transition_related: false,
    });
    const feed = await app.inject({
      method: "GET",
      url: "/v0/sync/changes?since=0&limit=1000",
      headers: as(f.cmOne),
    });
    const goal = (feed.json().changes as { id: string; row?: Record<string, unknown> }[]).find(
      (c) => c.id === s.goalId,
    );
    expect(goal?.row).toMatchObject({ srs_goal_order: 2, schedule: "2x weekly" });
  });
});
