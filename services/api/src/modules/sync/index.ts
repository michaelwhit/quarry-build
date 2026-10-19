import { authzFor } from "../auth/endpoints.ts";
import type { FastifyPluginAsync } from "fastify";
import type { components } from "@iep/openapi/types";
import type { FieldCrypto } from "../../crypto/fields.ts";
import { withTenant, type Db } from "../../db.ts";
import { HttpProblem, requireSession } from "../../session.ts";
import { authorizeChanges } from "./authorize.ts";
import { pullChanges } from "./changes.ts";
import { applyDataPoint, validateDataPoint, type PushResult } from "./push.ts";

type PushRequest = components["schemas"]["SyncPushRequest"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SYNC_ROLES = new Set(["district_it_admin", "vendor_support"]);

export const syncModule: FastifyPluginAsync<{ db: Db; crypto: FieldCrypto }> = async (
  app,
  { db, crypto },
) => {
  app.post<{ Body: PushRequest }>(
    "/v0/sync/push",
    { config: { authz: authzFor("syncPush") } },
    async (req) => {
      const session = requireSession(req);
      const body = req.body as Partial<PushRequest> | null;
      if (
        !body ||
        typeof body.device_id !== "string" ||
        !UUID.test(body.device_id) ||
        !Array.isArray(body.mutations) ||
        body.mutations.length > 500
      ) {
        throw new HttpProblem(400, "Bad Request");
      }
      if (NO_SYNC_ROLES.has(session.role)) throw new HttpProblem(403, "Forbidden");

      // Reject an unusable envelope before anything is applied, so a malformed later entry cannot
      // fail the request after earlier ones committed.
      for (const m of body.mutations) {
        if (typeof m?.idempotency_key !== "string" || !UUID.test(m.idempotency_key)) {
          throw new HttpProblem(400, "Bad Request");
        }
      }

      // Each mutation commits on its own, so one bad point never blocks the rest of the batch.
      const results: PushResult[] = [];
      for (const m of body.mutations) {
        const key = m.idempotency_key;
        if (m.entity !== "data_point" || m.op !== "insert") {
          results.push({
            idempotency_key: key,
            status: "rejected",
            reason: "unsupported_mutation",
          });
          continue;
        }
        const checked = validateDataPoint(m.payload);
        if (!checked.ok) {
          results.push({ idempotency_key: key, status: "rejected", reason: checked.reason });
          continue;
        }
        const outcome = await withTenant(
          db,
          session,
          (c) => applyDataPoint(c, session, body.device_id!, checked.value),
          {
            feedWriter: true,
          },
        );
        results.push(
          typeof outcome === "string"
            ? { idempotency_key: key, status: outcome }
            : { idempotency_key: key, status: "rejected", reason: outcome.rejected },
        );
      }
      return { results };
    },
  );

  app.get<{ Querystring: { since?: string; limit?: string } }>(
    "/v0/sync/changes",
    { config: { authz: authzFor("syncChanges") } },
    async (req) => {
      const session = requireSession(req);
      if (NO_SYNC_ROLES.has(session.role)) throw new HttpProblem(403, "Forbidden");
      const since = Number(req.query.since);
      const limit = req.query.limit === undefined ? 500 : Number(req.query.limit);
      if (!Number.isSafeInteger(since) || since < 0) throw new HttpProblem(400, "Bad Request");
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
        throw new HttpProblem(400, "Bad Request");
      const page = await withTenant(
        db,
        session,
        (c) => pullChanges(c, session, crypto, req.log, since, limit),
        { snapshot: true },
      );
      return { ...page, changes: await authorizeChanges(app, req, page.changes) };
    },
  );
};
