import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@iep/db";
import type { AuditEvent } from "../auth/types.ts";
import { computeHash, verifyChain, type StoredRow } from "./chain.ts";
import { PgAuditSink, createAuditPool, verifyTenantChain } from "./writer.ts";

const row = (seq: number, prev: Buffer | null, action: string): StoredRow => {
  const r = {
    tenantId: "t1",
    occurredAt: `2026-10-17T20:00:0${seq}.000Z`,
    actorId: "a1",
    actorRole: "case_manager",
    deviceId: "d1",
    action,
    entityType: "student",
    entityId: "s1",
    studentId: "s1",
    purpose: null,
  };
  return { ...r, seq, prevHash: prev, hash: computeHash(prev, r) };
};
const chain = () => {
  const a = row(1, null, "ReadSection.allow");
  const b = row(2, a.hash, "ReadSection.deny");
  const c = row(3, b.hash, "WriteSection.allow");
  return [a, b, c];
};

describe("hash chain", () => {
  it("verifies an intact chain, and an empty one", () => {
    expect(verifyChain(chain())).toEqual({ ok: true, rows: 3 });
    expect(verifyChain([])).toEqual({ ok: true, rows: 0 });
  });

  it("verifies in pages when given the previous page's last hash", () => {
    const [a, b, c] = chain();
    expect(verifyChain([a!, b!])).toEqual({ ok: true, rows: 2 });
    expect(verifyChain([c!], b!.hash)).toEqual({ ok: true, rows: 1 });
    expect(verifyChain([c!], a!.hash)).toMatchObject({ ok: false, seq: 3 });
  });

  it("detects an edited row", () => {
    const rows = chain();
    rows[1] = { ...rows[1]!, action: "ReadSection.allow" };
    expect(verifyChain(rows)).toMatchObject({ ok: false, seq: 2 });
  });

  it("detects a deleted row", () => {
    const [a, , c] = chain();
    expect(verifyChain([a!, c!])).toMatchObject({ ok: false, seq: 3 });
  });

  it("detects reordered rows and a rewritten first row", () => {
    const [a, b, c] = chain();
    expect(verifyChain([a!, c!, b!]).ok).toBe(false);
    expect(verifyChain([{ ...a!, actorId: "someone-else" }, b!, c!])).toMatchObject({
      ok: false,
      seq: 1,
    });
  });

  it("detects a truncated head: a first row that claims a previous hash", () => {
    const [, b, c] = chain();
    expect(verifyChain([b!, c!])).toMatchObject({ ok: false, seq: 2 });
  });

  it("is sensitive to every field", () => {
    const base = row(1, null, "x");
    for (const field of [
      "tenantId",
      "occurredAt",
      "actorId",
      "actorRole",
      "deviceId",
      "action",
      "entityType",
      "entityId",
      "studentId",
      "purpose",
    ] as const) {
      const changed = { ...base, [field]: "changed" };
      expect(computeHash(null, changed).equals(base.hash), field).toBe(false);
    }
  });
});

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("PgAuditSink", () => {
  const pool = new pg.Pool({ connectionString: url, max: 8 });
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const event = (tenantId: string, i: number): AuditEvent => ({
    action: "ReadSection",
    outcome: i % 5 === 0 ? "deny" : "allow",
    actorId: randomUUID(),
    actorRole: "case_manager",
    tenantId,
    deviceId: randomUUID(),
    entityType: "student",
    entityId: randomUUID(),
    studentId: randomUUID(),
    policies: [],
    requestId: `req-${i}`,
  });

  beforeAll(async () => {
    const client = await pool.connect();
    await migrate(client);
    for (const id of [tenantA, tenantB]) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [id]);
      await client.query("INSERT INTO tenant (id, name) VALUES ($1, 'Synthetic District')", [id]);
      await client.query("COMMIT");
    }
    client.release();
  });
  afterAll(async () => {
    await pool.end();
  });

  it("writes concurrent events as one unbroken chain per tenant", async () => {
    const sink = new PgAuditSink(pool);
    await Promise.all([
      ...Array.from({ length: 30 }, (_, i) => sink.record(event(tenantA, i))),
      ...Array.from({ length: 10 }, (_, i) => sink.record(event(tenantB, i))),
    ]);
    const client = await pool.connect();
    try {
      expect(await verifyTenantChain(client, tenantA)).toEqual({ ok: true, rows: 30 });
      expect(await verifyTenantChain(client, tenantB)).toEqual({ ok: true, rows: 10 });
    } finally {
      client.release();
    }
  });

  it("createAuditPool survives an idle client error", async () => {
    const p = createAuditPool(url!, 1);
    const c = await p.connect();
    c.release();
    expect(() => p.emit("error", new Error("idle client died"))).not.toThrow();
    await p.end();
  });

  it("verifies a chain across several pages", async () => {
    const client = await pool.connect();
    try {
      expect(await verifyTenantChain(client, tenantA, 7)).toEqual({ ok: true, rows: 30 });
      expect(await verifyTenantChain(client, tenantB, 3)).toEqual({ ok: true, rows: 10 });
    } finally {
      client.release();
    }
  });

  it("rejects when the row cannot be written, so the request fails closed", async () => {
    const sink = new PgAuditSink(pool);
    await expect(sink.record({ ...event(tenantA, 1), actorId: "not-a-uuid" })).rejects.toThrow();
    await expect(sink.record(event(randomUUID(), 1))).rejects.toThrow(); // unknown tenant
    const client = await pool.connect();
    try {
      expect(await verifyTenantChain(client, tenantA)).toMatchObject({ ok: true });
    } finally {
      client.release();
    }
  });

  it("cannot be edited in the database", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query("UPDATE audit_event SET actor_id = NULL")).rejects.toThrow(
        /append-only/,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
