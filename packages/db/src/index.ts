import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type pg from "pg";

export const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

export interface AppliedMigration {
  name: string;
  appliedNow: boolean;
}

/**
 * Applies every file in migrations/ in name order, each in its own transaction, recording it in
 * schema_migration. Already-applied files are skipped. Run as the schema owner, not iep_app.
 */
export async function migrate(client: pg.Client | pg.PoolClient): Promise<AppliedMigration[]> {
  // One migrator at a time: parallel test files and parallel container starts must not race on a
  // fresh database. The lock is per session, so it is released even if a migration throws.
  await client.query("SELECT pg_advisory_lock(7100)");
  try {
    return await applyAll(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(7100)");
  }
}

async function applyAll(client: pg.Client | pg.PoolClient): Promise<AppliedMigration[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const done = new Set(
    (await client.query<{ name: string }>("SELECT name FROM schema_migration")).rows.map(
      (r) => r.name,
    ),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const result: AppliedMigration[] = [];
  for (const name of files) {
    if (done.has(name)) {
      result.push({ name, appliedNow: false });
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migration (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${name} failed: ${(err as Error).message}`, { cause: err });
    }
    result.push({ name, appliedNow: true });
  }
  return result;
}
