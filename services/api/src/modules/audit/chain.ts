import { createHash } from "node:crypto";

/** The fields of an audit row that the hash covers. Everything is a string or null so the encoding is exact. */
export interface ChainRecord {
  tenantId: string;
  occurredAt: string; // ISO 8601, millisecond precision, UTC
  actorId: string | null;
  actorRole: string | null;
  deviceId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  studentId: string | null;
  purpose: string | null;
}

/**
 * hash = SHA-256(prev_hash || 0x00 || JSON([...fields in fixed order])). The first row of a
 * tenant's chain has no prev_hash. Changing, deleting or reordering any row breaks every hash after it.
 */
export function computeHash(prev: Buffer | null, r: ChainRecord): Buffer {
  const body = JSON.stringify([
    r.tenantId,
    r.occurredAt,
    r.actorId,
    r.actorRole,
    r.deviceId,
    r.action,
    r.entityType,
    r.entityId,
    r.studentId,
    r.purpose,
  ]);
  return createHash("sha256")
    .update(prev ?? Buffer.alloc(0))
    .update(Buffer.from([0]))
    .update(body, "utf8")
    .digest();
}

export interface StoredRow extends ChainRecord {
  seq: number;
  prevHash: Buffer | null;
  hash: Buffer;
}

export type ChainVerdict = { ok: true; rows: number } | { ok: false; seq: number; reason: string };

/**
 * Checks rows (already in seq order, one tenant) link to each other and hash correctly.
 * `start` is the hash the first row must link to: null at the beginning of a chain, or the last
 * hash of the previous page when verifying a chain in pages.
 */
export function verifyChain(rows: readonly StoredRow[], start: Buffer | null = null): ChainVerdict {
  let prev: Buffer | null = start;
  for (const row of rows) {
    const linked = prev === null ? row.prevHash === null : row.prevHash?.equals(prev) === true;
    if (!linked)
      return { ok: false, seq: row.seq, reason: "prev_hash does not match the previous row" };
    if (!computeHash(row.prevHash, row).equals(row.hash)) {
      return { ok: false, seq: row.seq, reason: "hash does not match the row contents" };
    }
    prev = row.hash;
  }
  return { ok: true, rows: rows.length };
}
