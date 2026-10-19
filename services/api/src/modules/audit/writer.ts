import pg from "pg";
import type { AuditEvent, AuditSink } from "../auth/types.ts";
import { computeHash, verifyChain, type ChainVerdict, type StoredRow } from "./chain.ts";

/**
 * Appends one hash-chained row per event. Each tenant has its own chain; an advisory lock per
 * tenant serializes writers so two requests cannot both link to the same previous row. The
 * returned promise rejects if anything goes wrong, and the auth middleware then fails the request.
 *
 * `pool` must connect as the iep_app role (no UPDATE or DELETE on audit_event).
 */
export class PgAuditSink implements AuditSink {
  private readonly pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async record(e: AuditEvent): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [e.tenantId]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `audit:${e.tenantId}`,
      ]);
      const last = await client.query<{ hash: Buffer }>(
        "SELECT hash FROM audit_event WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1",
        [e.tenantId],
      );
      const prev = last.rows[0]?.hash ?? null;
      const record = {
        tenantId: e.tenantId,
        occurredAt: new Date().toISOString(),
        actorId: e.actorId,
        actorRole: e.actorRole,
        deviceId: e.deviceId,
        // The decision is part of the action name; policy ids and request id are logged by the api, not stored here yet.
        action: `${e.action}.${e.outcome}`,
        entityType: e.entityType,
        entityId: e.entityId,
        studentId: e.studentId,
        purpose: null,
      };
      await client.query(
        `INSERT INTO audit_event
           (tenant_id, occurred_at, actor_id, actor_role, device_id, action, entity_type, entity_id, student_id, purpose, prev_hash, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          record.tenantId,
          record.occurredAt,
          record.actorId,
          record.actorRole,
          record.deviceId,
          record.action,
          record.entityType,
          record.entityId,
          record.studentId,
          record.purpose,
          prev,
          computeHash(prev, record),
        ],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * A pool for the audit sink alone. record() holds a connection while it waits on the tenant lock,
 * so sharing the request pool could let a burst of requests starve it and deadlock. Connect as iep_app.
 */
export function createAuditPool(connectionString: string, max = 4): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  // An idle client can error (for example the database restarts). Without a listener that crashes
  // the process; with one the pool drops the client and the next record() gets a fresh connection.
  pool.on("error", (err) => {
    console.error("audit pool: idle client error:", err.name);
  });
  return pool;
}

const PAGE = 1000;

/**
 * Reads one tenant's chain a page at a time and verifies it, so a large tenant is never held in
 * memory whole. For the director's audit report and the nightly check.
 */
export async function verifyTenantChain(
  client: pg.PoolClient | pg.Client,
  tenantId: string,
  pageSize = PAGE,
): Promise<ChainVerdict> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    let afterSeq = 0;
    let prev: Buffer | null = null;
    let total = 0;
    for (;;) {
      const res = await client.query(
        `SELECT seq, tenant_id, occurred_at, actor_id, actor_role, device_id, action, entity_type,
                entity_id, student_id, purpose, prev_hash, hash
           FROM audit_event WHERE tenant_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
        [tenantId, afterSeq, pageSize],
      );
      if (res.rows.length === 0) return { ok: true, rows: total };
      const rows: StoredRow[] = res.rows.map((r) => ({
        seq: Number(r.seq),
        tenantId: r.tenant_id,
        occurredAt: (r.occurred_at as Date).toISOString(),
        actorId: r.actor_id,
        actorRole: r.actor_role,
        deviceId: r.device_id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        studentId: r.student_id,
        purpose: r.purpose,
        prevHash: r.prev_hash,
        hash: r.hash,
      }));
      const verdict = verifyChain(rows, prev);
      if (!verdict.ok) return verdict;
      total += rows.length;
      const last = rows[rows.length - 1]!;
      afterSeq = last.seq;
      prev = last.hash;
    }
  } finally {
    await client.query("ROLLBACK");
  }
}
