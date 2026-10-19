import pg from "pg";
import type { Session } from "./session.ts";

export type Db = pg.Pool;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * Runs fn in one transaction as the low-privilege iep_app role with the tenant set from the
 * session, so row-level security applies to every statement. The tenant setting is transaction
 * local and can never leak to the next user of the pooled connection.
 */
export async function withTenant<T>(
  db: Db,
  session: Pick<Session, "tenantId">,
  fn: (client: pg.PoolClient) => Promise<T>,
  options: { feedWriter?: boolean; snapshot?: boolean } = {},
): Promise<T> {
  const client = await db.connect();
  try {
    // A snapshot read sees one consistent point in time for every statement, so a change feed
    // pull cannot skip a row that commits between its per-entity queries.
    await client.query(
      options.snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    await client.query("SET LOCAL ROLE iep_app");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [session.tenantId]);
    // Requests that write change-feed rows take the feed's ordering lock first, before they lock
    // any row, so every writer acquires locks in the same order and none can deadlock on it.
    // Migration 0002 documents the lock; the triggers take it again harmlessly.
    if (options.feedWriter) await client.query("SELECT pg_advisory_xact_lock(7101)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
