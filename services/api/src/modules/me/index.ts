import { authzFor } from "../auth/endpoints.ts";
import type { FastifyPluginAsync } from "fastify";
import { withTenant, type Db } from "../../db.ts";
import { HttpProblem, requireSession } from "../../session.ts";

export const meModule: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.get("/v0/me", { config: { authz: authzFor("getMe") } }, async (req) => {
    const session = requireSession(req);
    const row = await withTenant(db, session, async (c) => {
      const res = await c.query<{ id: string; display_name: string; email: string; role: string }>(
        `SELECT id, display_name, email, role FROM staff
         WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
        [session.staffId],
      );
      return res.rows[0];
    });
    // A deactivated or deleted staff row ends the session's usefulness at once.
    if (!row) throw new HttpProblem(401, "Unauthorized");
    return row;
  });
};
