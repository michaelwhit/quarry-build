import type pg from "pg";
import type { components } from "@iep/openapi/types";
import { visibleStudentsCte } from "../../scope.ts";
import type { Session } from "../../session.ts";

type DataPoint = components["schemas"]["DataPoint"];
/** How long a device may hold a point before syncing it. Older points are rejected, not retried. */
const MAX_OFFLINE_MS = 14 * 24 * 3_600_000;

export type PushResult = components["schemas"]["SyncMutationResult"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORDERS = new Set([
  "case_manager",
  "related_service_provider",
  "gen_ed_teacher",
  "paraprofessional",
]);
// Delegated roles record only for goals a case manager handed them.
const NEEDS_DELEGATION = new Set(["gen_ed_teacher", "paraprofessional"]);

/** Reasons are machine-readable and never contain student data. */
export function validateDataPoint(
  p: unknown,
): { ok: true; value: DataPoint } | { ok: false; reason: string } {
  if (typeof p !== "object" || p === null) return { ok: false, reason: "invalid_payload" };
  const d = p as Record<string, unknown>;
  for (const k of ["id", "goal_id", "plan_id", "collector_id", "device_id"]) {
    if (typeof d[k] !== "string" || !UUID.test(d[k])) return { ok: false, reason: `invalid_${k}` };
  }
  for (const k of ["objective_id", "corrects_id"]) {
    if (d[k] !== undefined && (typeof d[k] !== "string" || !UUID.test(d[k]))) {
      return { ok: false, reason: `invalid_${k}` };
    }
  }
  for (const k of ["observed_at", "client_created_at"]) {
    if (typeof d[k] !== "string" || Number.isNaN(Date.parse(d[k])))
      return { ok: false, reason: `invalid_${k}` };
  }
  for (const k of ["correct", "total"]) {
    if (d[k] !== undefined && (!Number.isInteger(d[k]) || (d[k] as number) < 0)) {
      return { ok: false, reason: `invalid_${k}` };
    }
  }
  if (
    d.correct !== undefined &&
    d.total !== undefined &&
    (d.correct as number) > (d.total as number)
  ) {
    return { ok: false, reason: "correct_exceeds_total" };
  }
  if (
    d.value_num !== undefined &&
    (typeof d.value_num !== "number" || !Number.isFinite(d.value_num))
  ) {
    return { ok: false, reason: "invalid_value_num" };
  }
  for (const k of ["prompt_level", "setting"]) {
    if (d[k] !== undefined && (typeof d[k] !== "string" || (d[k] as string).length > 200)) {
      return { ok: false, reason: `invalid_${k}` };
    }
  }
  if (d.note !== undefined && (typeof d.note !== "string" || d.note.length > 2000)) {
    return { ok: false, reason: "invalid_note" };
  }
  if (
    d.step_results !== undefined &&
    (!Array.isArray(d.step_results) ||
      d.step_results.length > 200 ||
      d.step_results.some((s) => typeof s !== "boolean"))
  ) {
    return { ok: false, reason: "invalid_step_results" };
  }
  return { ok: true, value: d as unknown as DataPoint };
}

interface PlanRow {
  type: string;
  trials_per_session: number | null;
  prompt_hierarchy: string[];
  task_steps: string[];
}

/** Server-side twin of the client's DataPoint.validate(against:): a value must fit its plan. */
function checkAgainstPlan(plan: PlanRow, p: DataPoint): string | undefined {
  if (p.value_num !== undefined && p.value_num < 0) return "negative_value";
  switch (plan.type) {
    case "percent_correct":
      if (p.value_num === undefined) return "missing_value";
      return p.value_num > 100 ? "percent_out_of_range" : undefined;
    case "trials":
    case "yes_no":
      if (p.correct === undefined || p.total === undefined) return "missing_value";
      if (plan.trials_per_session !== null && p.total > plan.trials_per_session) {
        return "total_exceeds_trials_per_session";
      }
      return undefined;
    case "task_analysis":
      if (!p.step_results) return "missing_value";
      return p.step_results.length === plan.task_steps.length ? undefined : "step_count_mismatch";
    case "prompt_level":
      if (!p.prompt_level) return "missing_value";
      return plan.prompt_hierarchy.includes(p.prompt_level) ? undefined : "unknown_prompt_level";
    default:
      return p.value_num === undefined ? "missing_value" : undefined;
  }
}

/**
 * Applies one data point inside the caller's tenant transaction. Safe to retry: a replay of a
 * point this staff member already pushed is reported as applied, not duplicated.
 */
export async function applyDataPoint(
  c: pg.PoolClient,
  session: Session,
  deviceId: string,
  p: DataPoint,
): Promise<PushResult["status"] | { rejected: string }> {
  if (!RECORDERS.has(session.role)) return { rejected: "role_cannot_record" };
  if (p.collector_id !== session.staffId) return { rejected: "collector_mismatch" };
  if (p.device_id !== deviceId) return { rejected: "device_mismatch" };

  // Delegation is judged as of the moment the point was recorded, not when it reached the
  // server: a para who recorded on Friday while the delegation was valid is not penalized for
  // syncing on Monday. The device clock is bounded on both sides (5 minutes ahead, 14 days
  // behind) so a forged client_created_at cannot be used to reach back into an earlier delegation.
  const now = Date.now();
  if (Date.parse(p.client_created_at) > now + 5 * 60_000) return { rejected: "client_clock_ahead" };
  if (Date.parse(p.client_created_at) < now - MAX_OFFLINE_MS)
    return { rejected: "client_clock_behind" };
  if (Date.parse(p.observed_at) > now + 24 * 3_600_000) return { rejected: "observed_in_future" };

  // The goal must belong to a student the caller can see, and the plan and any objective or
  // corrected point must belong to that same goal.
  const goal = await c.query<{ delegated: boolean }>(
    `WITH ${visibleStudentsCte(session)}
     SELECT EXISTS (
       SELECT 1 FROM goal_delegation d
       WHERE d.goal_id = g.id AND d.staff_id = $1
         AND d.created_at <= $3::timestamptz
         AND (d.expires_at IS NULL OR d.expires_at > $3::timestamptz)
         AND (d.deleted_at IS NULL OR d.deleted_at > $3::timestamptz)) AS delegated
     FROM goal g
     JOIN iep i ON i.id = g.iep_id AND i.deleted_at IS NULL
     JOIN vis ON vis.student_id = i.student_id
     JOIN student st ON st.id = i.student_id AND st.deleted_at IS NULL
     WHERE g.id = $2 AND g.deleted_at IS NULL`,
    [session.staffId, p.goal_id, p.client_created_at],
  );
  const g = goal.rows[0];
  if (!g) return { rejected: "unknown_goal" };
  if (NEEDS_DELEGATION.has(session.role) && !g.delegated) return { rejected: "goal_not_delegated" };

  const plan = await c.query<PlanRow>(
    `SELECT type, trials_per_session, prompt_hierarchy, task_steps
     FROM measurement_plan WHERE id = $1 AND goal_id = $2 AND deleted_at IS NULL`,
    [p.plan_id, p.goal_id],
  );
  const planRow = plan.rows[0];
  if (!planRow) return { rejected: "unknown_plan" };
  const meaning = checkAgainstPlan(planRow, p);
  if (meaning) return { rejected: meaning };
  if (p.objective_id) {
    const o = await c.query(
      "SELECT 1 FROM objective WHERE id = $1 AND goal_id = $2 AND deleted_at IS NULL",
      [p.objective_id, p.goal_id],
    );
    if (o.rowCount === 0) return { rejected: "unknown_objective" };
  }
  if (p.corrects_id) {
    const o = await c.query<{ collector_id: string }>(
      "SELECT collector_id FROM data_point WHERE id = $1 AND goal_id = $2",
      [p.corrects_id, p.goal_id],
    );
    const original = o.rows[0];
    if (!original) return { rejected: "unknown_corrected_point" };
    // Only the person who recorded a point, or the case manager, may supersede it.
    if (original.collector_id !== session.staffId && session.role !== "case_manager") {
      return { rejected: "correction_not_allowed" };
    }
  }

  const inserted = await c.query(
    `INSERT INTO data_point (id, tenant_id, goal_id, objective_id, plan_id, observed_at, value_num,
       correct, total, prompt_level, step_results, setting, note, collector_id, device_id,
       client_created_at, corrects_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (id) DO NOTHING`,
    [
      p.id,
      session.tenantId,
      p.goal_id,
      p.objective_id ?? null,
      p.plan_id,
      p.observed_at,
      p.value_num ?? null,
      p.correct ?? null,
      p.total ?? null,
      p.prompt_level ?? null,
      p.step_results ? JSON.stringify(p.step_results) : null,
      p.setting ?? null,
      p.note ?? null,
      p.collector_id,
      p.device_id,
      p.client_created_at,
      p.corrects_id ?? null,
    ],
  );
  if (inserted.rowCount === 1) return "applied";

  // The id exists. A retry of the same point by the same collector is fine; anything else is a
  // different record claiming an id that is taken.
  const existing = await c.query(
    "SELECT 1 FROM data_point WHERE id = $1 AND collector_id = $2 AND goal_id = $3 AND client_created_at = $4",
    [p.id, p.collector_id, p.goal_id, p.client_created_at],
  );
  return existing.rowCount === 1 ? "applied" : "conflict";
}
