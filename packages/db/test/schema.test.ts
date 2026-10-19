// Integration tests for schema v0. Needs DATABASE_URL pointing at a throwaway database whose user
// owns the schema (CI uses a Postgres service container). Skipped when DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/index.ts";

const url = process.env.DATABASE_URL;
const tenantA = randomUUID();
const tenantB = randomUUID();

// In CI a missing DATABASE_URL is a failure, never a green skip.
it.runIf(!url && process.env.CI)("has a database to test against in CI", () => {
  throw new Error("DATABASE_URL is not set in CI: the row-level security tests did not run");
});

describe.skipIf(!url)("schema v0", () => {
  const client = new pg.Client({ connectionString: url });

  /** Runs fn as iep_app inside a transaction scoped to one tenant, then rolls back. */
  async function asApp<T>(tenant: string, fn: () => Promise<T>): Promise<T> {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE iep_app");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
      return await fn();
    } finally {
      await client.query("ROLLBACK");
    }
  }

  beforeAll(async () => {
    await client.connect();
    await migrate(client);
    for (const [id, name] of [
      [tenantA, "Synthetic District A"],
      [tenantB, "Synthetic District B"],
    ]) {
      // Seed as the owner with the tenant setting, since FORCE RLS applies to the owner too.
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [id]);
      await client.query("INSERT INTO tenant (id, name) VALUES ($1, $2)", [id, name]);
      await client.query("INSERT INTO school (id, tenant_id, name) VALUES ($1, $2, $3)", [
        randomUUID(),
        id,
        `${name} Elementary`,
      ]);
      await client.query("COMMIT");
    }
  });

  afterAll(async () => {
    await client.end();
  });

  it("is idempotent", async () => {
    const second = await migrate(client);
    expect(second.every((m) => !m.appliedNow)).toBe(true);
  });

  it("shows each tenant only its own rows", async () => {
    const names = await asApp(tenantA, async () => {
      const { rows } = await client.query<{ name: string }>("SELECT name FROM school");
      return rows.map((r) => r.name);
    });
    expect(names).toEqual(["Synthetic District A Elementary"]);
  });

  it("shows nothing when no tenant is set", async () => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE iep_app");
      const { rowCount } = await client.query("SELECT 1 FROM school");
      expect(rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("refuses writes into another tenant", async () => {
    await expect(
      asApp(tenantA, () =>
        client.query("INSERT INTO school (id, tenant_id, name) VALUES ($1, $2, 'x')", [
          randomUUID(),
          tenantB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps audit_event append-only", async () => {
    await expect(
      asApp(tenantA, async () => {
        await client.query(
          "INSERT INTO audit_event (tenant_id, action, entity_type, hash) VALUES ($1, 'read', 'student', '\\x00')",
          [tenantA],
        );
        await client.query("SAVEPOINT s");
        await client.query("RESET ROLE");
        // Even the owner cannot rewrite history.
        return client.query("UPDATE audit_event SET action = 'tampered'");
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("gives iep_app no UPDATE on audit_event", async () => {
    await expect(
      asApp(tenantA, () => client.query("UPDATE audit_event SET action = 'x'")),
    ).rejects.toThrow(/permission denied/);
  });

  it("advances server_seq on every write", async () => {
    const seqs = await asApp(tenantA, async () => {
      const id = randomUUID();
      const school = (await client.query<{ id: string }>("SELECT id FROM school")).rows[0]!.id;
      const a = await client.query<{ server_seq: string }>(
        "INSERT INTO district_calendar (id, tenant_id, school_id, school_year, instructional_day) VALUES ($1, $2, $3, '2026-27', '2026-08-13') RETURNING server_seq",
        [id, tenantA, school],
      );
      const b = await client.query<{ server_seq: string; row_version: string }>(
        "UPDATE school SET name = name || ' (renamed)' WHERE id = $1 RETURNING server_seq, row_version",
        [school],
      );
      return {
        first: Number(a.rows[0]!.server_seq),
        second: Number(b.rows[0]!.server_seq),
        version: Number(b.rows[0]!.row_version),
      };
    });
    expect(seqs.second).toBeGreaterThan(seqs.first);
    expect(seqs.version).toBe(2);
  });
});
