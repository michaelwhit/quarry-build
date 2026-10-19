import { authzFor } from "../auth/endpoints.ts";
import type { FastifyPluginAsync } from "fastify";
import { withTenant, type Db } from "../../db.ts";
import { visibleGoalsCte, visibleStudentsCte } from "../../scope.ts";
import { HttpProblem, requireSession } from "../../session.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const goalsModule: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.get<{ Params: { studentId: string } }>(
    "/v0/students/:studentId/goals",
    { config: { authz: authzFor("listStudentGoals") } },
    async (req) => {
      const session = requireSession(req);
      const { studentId } = req.params;
      // Same answer for "no such student" and "not yours": nothing reveals what exists.
      if (!UUID.test(studentId)) throw new HttpProblem(404, "Not Found");

      const goals = await withTenant(db, session, async (c) => {
        const iep = await c.query<{ id: string }>(
          `WITH ${visibleStudentsCte(session)}
         SELECT i.id FROM iep i JOIN vis ON vis.student_id = i.student_id
         JOIN student st ON st.id = i.student_id AND st.deleted_at IS NULL
         WHERE i.student_id = $2 AND i.deleted_at IS NULL AND i.status <> 'expired'
         ORDER BY i.effective_from DESC NULLS LAST, i.id DESC LIMIT 1`,
          [session.staffId, studentId],
        );
        const iepId = iep.rows[0]?.id;
        if (!iepId) return undefined;

        const res = await c.query<Record<string, unknown>>(
          `WITH ${visibleStudentsCte(session)}, ${visibleGoalsCte(session)}
         SELECT g.id, g.iep_id, g.area, g.statement, g.condition, g.behavior, g.baseline, g.target,
                g.criteria, g.evaluation_method, g.schedule, g.standard_refs, g.srs_goal_order,
                g.is_transition_related, g.sequence,
                coalesce(
                  (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                      'id', p.id, 'goal_id', p.goal_id, 'objective_id', p.objective_id,
                      'type', p.type, 'unit', p.unit, 'target_value', p.target_value,
                      'trials_per_session', p.trials_per_session,
                      'prompt_hierarchy', to_jsonb(p.prompt_hierarchy),
                      'task_steps', to_jsonb(p.task_steps), 'frequency', p.frequency))
                    ORDER BY p.id)
                   FROM measurement_plan p WHERE p.goal_id = g.id AND p.deleted_at IS NULL),
                  '[]'::jsonb) AS measurement_plans
         FROM goal g JOIN vg ON vg.goal_id = g.id
         WHERE g.iep_id = $2 AND g.deleted_at IS NULL ORDER BY g.sequence, g.id`,
          [session.staffId, iepId],
        );
        return res.rows.map(stripNulls);
      });
      if (!goals) throw new HttpProblem(404, "Not Found");

      // Cedar decides per goal what the caller may read: full goals (S4), assigned goal text only
      // (S2), and the measurement plans (S3, only for delegated goals when the role needs that).
      const decide = async (tier: 2 | 3 | 4, goalId: string) => {
        const r = await app.authorizeItem(
          req,
          { kind: "student", action: "ReadSection", tier },
          studentId,
          goalId,
        );
        // A failed policy or audit step is not a denial: fail the request, do not hide goals.
        if (r === "error") throw new HttpProblem(503, "Service Unavailable");
        return r;
      };
      const out: Record<string, unknown>[] = [];
      for (const g of goals) {
        const id = g["id"] as string;
        const plans = (await decide(3, id)) === "allow";
        if ((await decide(4, id)) === "allow") {
          if (!plans) delete g["measurement_plans"];
          out.push(g);
        } else if ((await decide(2, id)) === "allow") {
          const text = Object.fromEntries(
            Object.entries(g).filter(([k]) =>
              ["id", "iep_id", "area", "statement", "sequence"].includes(k),
            ),
          );
          if (plans) text["measurement_plans"] = g["measurement_plans"];
          out.push(text);
        }
      }
      return { goals: out };
    },
  );
};

/** The contract omits absent optional fields instead of sending nulls. */
function stripNulls(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
}
