// Integration tests for the director CSV imports. Needs DATABASE_URL.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCsv, CsvError } from "../src/modules/caseloads/csv.ts";
import { as, databaseUrl, ownerClient, seedTenant, testApp, type Fixture } from "./helpers.ts";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("csv reader", () => {
  it("handles quotes, doubled quotes, CRLF, a BOM and blank lines", () => {
    const { headers, rows } = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n3,4\n');
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      { a: "x, y", b: 'say "hi"' },
      { a: "3", b: "4" },
    ]);
  });

  it("refuses hostile input", () => {
    expect(() => parseCsv('a\n"open')).toThrow(CsvError);
    expect(() => parseCsv(`a\n${"x".repeat(201)}`)).toThrow(/field_too_long/);
    expect(() => parseCsv(`a\n${"1\n".repeat(5001)}`)).toThrow(/too_many_rows/);
    expect(() => parseCsv("")).toThrow(/empty_file/);
  });
});

describe.skipIf(!databaseUrl)("caseload imports", () => {
  let owner: pg.Client;
  let f: Fixture;
  let app: Awaited<ReturnType<typeof testApp>>;
  let casey: Fixture["cmOne"];

  beforeAll(async () => {
    owner = await ownerClient();
    f = await seedTenant(owner, "import");
    casey = { tenantId: f.tenantId, staffId: randomUUID(), role: "case_manager" };
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [f.tenantId]);
    await owner.query(
      "INSERT INTO school (id, tenant_id, name) VALUES ($1, $2, 'Synthetic Elementary')",
      [randomUUID(), f.tenantId],
    );
    await owner.query(
      "INSERT INTO staff (id, tenant_id, email, display_name, role) VALUES ($1, $2, 'casey@import.example.test', 'Casey', 'case_manager')",
      [casey.staffId, f.tenantId],
    );
    await owner.query("COMMIT");
    app = await testApp();
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const post = (url: string, who: Fixture["cmOne"], payload: object) =>
    app.inject({ method: "POST", url, headers: as(who), payload });
  const students = async () =>
    (await app.inject({ method: "GET", url: "/v0/students", headers: as(f.director) })).json()
      .students as { display_name: string }[];

  it("previews without writing, then loads a PowerSchool-style roster", async () => {
    const csv = await fixture("sample-roster.csv");
    const before = (await students()).length;
    const preview = await post("/v0/imports/students", f.director, {
      csv,
      commit: false,
      date_format: "mdy",
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      committed: false,
      rows: 4,
      creates: 4,
      updates: 0,
      errors: [],
    });
    expect((await students()).length).toBe(before);

    const done = await post("/v0/imports/students", f.director, {
      csv,
      commit: true,
      date_format: "mdy",
    });
    expect(done.json()).toMatchObject({ committed: true, creates: 4, errors: [] });
    const names = (await students()).map((s) => s.display_name);
    expect(names).toEqual(expect.arrayContaining(["Ada Q.", "Ben M.", 'Cy "CJ" O.', "Dee V."]));
  });

  it("is idempotent, updates changed rows, and flags students missing from a newer file", async () => {
    const csv = await fixture("sample-roster.csv");
    const same = await post("/v0/imports/students", f.director, {
      csv,
      commit: true,
      date_format: "mdy",
    });
    expect(same.json()).toMatchObject({ creates: 0, updates: 0, unchanged: 4 });

    const newer = csv
      .replace("Dee,Vance,01/30/2017,K", "Dee,Vance,01/30/2017,1")
      .split("\n")
      .filter((l) => !l.startsWith("SYN-1002"))
      .join("\n");
    const res = await post("/v0/imports/students", f.director, {
      csv: newer,
      commit: true,
      date_format: "mdy",
    });
    expect(res.json()).toMatchObject({ creates: 0, updates: 1, unchanged: 2 });
    // Ben (SYN-1002) was absent from the file: flagged for review, not removed. The seeded
    // students have no local id, so only the imported ones count.
    expect(res.json().missing_from_file).toBe(1);
    expect((await students()).map((s) => s.display_name)).toContain("Ben M.");
  });

  it("refuses a bad file as a whole, naming rows and fields but never the cells", async () => {
    const csv = [
      "Student_Number,First_Name,Last_Name,DOB,Grade_Level,School_Name",
      "SYN-2001,Eve,Hart,2016-02-30,2,Synthetic Elementary",
      "SYN-2002,Fay,Lowe,2016-05-05,13,Synthetic Elementary",
      "SYN-2003,Gus,Penn,2016-05-05,2,Nowhere School",
      "SYN-2004,Hal,Rook,2016-05-05,2,Synthetic Elementary",
      "SYN-2004,Hal,Rook,2016-05-05,2,Synthetic Elementary",
    ].join("\n");
    const res = await post("/v0/imports/students", f.director, { csv, commit: true });
    expect(res.statusCode).toBe(422);
    const report = res.json();
    expect(report.committed).toBe(false);
    expect(report.errors).toEqual([
      { row: 2, field: "dob", code: "invalid_date" },
      { row: 3, field: "grade", code: "invalid_grade" },
      { row: 4, field: "school", code: "unknown_school" },
      { row: 6, field: "local_student_id", code: "duplicate_in_file" },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/Eve|Hart|Nowhere/);
    expect((await students()).map((s) => s.display_name)).not.toContain("Hal R.");
  });

  it("supports a configurable column mapping and reports missing columns", async () => {
    const csv = "ID,Given,Family,Yr,Campus\nSYN-3001,Ivy,Cole,5,Synthetic Elementary";
    const mapping = {
      local_student_id: "ID",
      first_name: "Given",
      last_name: "Family",
      grade: "Yr",
      school: "Campus",
    };
    expect(
      (await post("/v0/imports/students", f.director, { csv, commit: true, mapping })).json(),
    ).toMatchObject({ creates: 1 });
    const missing = await post("/v0/imports/students", f.director, {
      csv: "foo\nbar",
      commit: false,
    });
    expect(missing.json().errors).toEqual(
      expect.arrayContaining([{ row: 0, field: "first_name", code: "column_not_found" }]),
    );
    const badMap = await post("/v0/imports/students", f.director, {
      csv,
      commit: false,
      mapping: { grade: "Nope" },
    });
    expect(badMap.statusCode).toBe(400);
  });

  it("assigns staff from a second CSV and never lets the uploader add themselves", async () => {
    const csv = await fixture("sample-assignments.csv");
    const preview = await post("/v0/imports/caseloads", f.director, { csv, commit: false });
    expect(preview.json()).toMatchObject({ creates: 3, errors: [] });
    expect(
      (await post("/v0/imports/caseloads", f.director, { csv, commit: true })).json(),
    ).toMatchObject({ committed: true, creates: 3 });
    expect(
      (await post("/v0/imports/caseloads", f.director, { csv, commit: true })).json(),
    ).toMatchObject({ creates: 0, unchanged: 3 });

    const mine = await app.inject({ method: "GET", url: "/v0/students", headers: as(casey) });
    expect(
      (mine.json().students as { display_name: string }[]).map((x) => x.display_name).sort(),
    ).toEqual(["Ada Q.", "Ben M.", 'Cy "CJ" O.'].sort());

    const self = await post("/v0/imports/caseloads", f.director, {
      csv: `staff_email,student_id\nstaff0@import.example.test,SYN-1001\nnobody@import.example.test,SYN-1001\ncasey@import.example.test,SYN-9999`,
      commit: true,
    });
    expect(self.statusCode).toBe(422);
    expect(self.json().errors).toEqual([
      { row: 2, field: "staff_email", code: "cannot_assign_self" },
      { row: 3, field: "staff_email", code: "unknown_staff" },
      { row: 4, field: "local_student_id", code: "unknown_student" },
    ]);
  });

  it("is for directors and coordinators only", async () => {
    const csv = await fixture("sample-roster.csv");
    for (const who of [
      f.cmOne,
      { ...f.cmOne, role: "gen_ed_teacher" as const },
      { ...f.cmOne, role: "district_it_admin" as const },
    ]) {
      expect((await post("/v0/imports/students", who, { csv, commit: true })).statusCode).toBe(403);
      expect((await post("/v0/imports/caseloads", who, { csv, commit: true })).statusCode).toBe(
        403,
      );
    }
    const coordinator = { ...f.director, role: "building_coordinator" as const };
    expect(
      (await post("/v0/imports/students", coordinator, { csv, commit: false, date_format: "mdy" }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v0/imports/students",
          payload: { csv, commit: false },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await post("/v0/imports/students", f.director, { csv: 5, commit: false })).statusCode,
    ).toBe(400);
  });
});
