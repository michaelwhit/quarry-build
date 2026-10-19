import type pg from "pg";
import type { FieldCrypto } from "../../crypto/fields.ts";
import { visibleGoalsCte, visibleStudentsCte } from "../../scope.ts";
import type { Session } from "../../session.ts";
import { safeDisplayName } from "../students/index.ts";

export interface Change {
  entity: string;
  id: string;
  server_seq: number;
  deleted: boolean;
  row?: Record<string, unknown>;
  /** Server-only: which student (and goal) the row belongs to, for per-item authorization. Never sent. */
  scope?: { student: string; goal?: string };
}

interface EntityQuery {
  entity: string;
  /** Selects `id`, `eff` (the effective change position) and `deleted`, plus the row's fields. */
  sql: string;
  shape?: (
    row: Record<string, unknown>,
    session: Session,
    crypto: FieldCrypto,
    log: Log,
  ) => Record<string, unknown> | undefined;
}

type Log = Parameters<typeof safeDisplayName>[0];

// `vis.ca_seq` is the position of the caller's caseload assignment for that student. A student
// who joins a caseload carries older rows (goals, points) with it, so their effective position
// is the later of the row's own seq and the assignment's. Tombstones keep the same position.
const EFF = (alias: string, seq = "vis.ca_seq") => `GREATEST(${alias}.server_seq, ${seq})`;
const BY_STUDENT = (
  table: string,
  join: string,
  cols: string,
  seq = "vis.ca_seq",
  sid = "vis.student_id",
  gid = "NULL::uuid",
) => `
  SELECT t.id, ${EFF("t", seq)} AS eff, ${table === "data_point" ? "false" : "(t.deleted_at IS NOT NULL)"} AS deleted,
         ${sid} AS _sid, ${gid} AS _gid, ${cols}
  FROM ${table} t ${join}
  WHERE ${EFF("t", seq)} > $2 ORDER BY eff LIMIT $3`;
// Goal-level rows go through `vg`, which narrows gen-ed teachers and paraprofessionals to delegated goals.
const BY_GOAL = (table: string, goalCol: string, cols: string) =>
  BY_STUDENT(
    table,
    `JOIN vg ON vg.goal_id = t.${goalCol}`,
    cols,
    "vg.g_seq",
    "vg.student_id",
    `t.${goalCol}`,
  );

const ENTITIES: EntityQuery[] = [
  {
    entity: "school",
    sql: `SELECT t.id, t.server_seq AS eff, (t.deleted_at IS NOT NULL) AS deleted, t.name, t.grade_span
          FROM school t WHERE t.server_seq > $2 AND $1::uuid IS NOT NULL ORDER BY eff LIMIT $3`,
  },
  {
    entity: "reporting_period",
    sql: `SELECT t.id, t.server_seq AS eff, (t.deleted_at IS NOT NULL) AS deleted, t.school_id,
                 t.school_year, t.srs_report_date
          FROM reporting_period t WHERE t.server_seq > $2 AND $1::uuid IS NOT NULL ORDER BY eff LIMIT $3`,
  },
  {
    entity: "district_calendar",
    sql: `SELECT t.id, t.server_seq AS eff, false AS deleted, t.school_id, t.school_year, t.instructional_day
          FROM district_calendar t WHERE t.server_seq > $2 AND $1::uuid IS NOT NULL ORDER BY eff LIMIT $3`,
  },
  {
    entity: "student",
    sql: BY_STUDENT(
      "student",
      "JOIN vis ON vis.student_id = t.id",
      "t.school_id, t.grade, t.first_name_enc, t.last_name_enc, t.preferred_name_enc",
      "vis.ca_seq",
      "t.id",
    ),
    // S1 only. The device never gets ciphertext or the blind index; its own store is encrypted.
    // A row that fails to decrypt is skipped (and logged by id) rather than failing the page.
    shape: (r, s, crypto, log) => {
      const display_name = safeDisplayName(log, crypto, s.tenantId, r as never);
      return display_name === undefined
        ? undefined
        : { school_id: r.school_id, grade: r.grade, display_name };
    },
  },
  {
    entity: "iep",
    sql: BY_STUDENT(
      "iep",
      "JOIN vis ON vis.student_id = t.student_id",
      "t.student_id, t.plan_type, t.status, t.type, t.effective_from, t.effective_to",
      "vis.ca_seq",
      "t.student_id",
    ),
  },
  {
    entity: "goal",
    sql: BY_STUDENT(
      "goal",
      "JOIN vg ON vg.goal_id = t.id",
      `t.iep_id, vg.student_id, t.area, t.statement, t."condition", t.behavior, t.baseline, t.target,
       t.criteria, t.evaluation_method, t.schedule, t.standard_refs, t.srs_goal_order,
       t.is_transition_related, t.sequence`,
      "vg.g_seq",
      "vg.student_id",
      "t.id",
    ),
  },
  {
    entity: "objective",
    sql: BY_GOAL(
      "objective",
      "goal_id",
      "t.goal_id, t.statement, t.criteria, t.target_date, t.sequence",
    ),
  },
  {
    entity: "measurement_plan",
    sql: BY_GOAL(
      "measurement_plan",
      "goal_id",
      `t.goal_id, t.objective_id, t.type, t.unit, t.target_value, t.trials_per_session,
       t.prompt_hierarchy, t.task_steps, t.frequency`,
    ),
  },
  {
    entity: "data_point",
    sql: BY_GOAL(
      "data_point",
      "goal_id",
      `t.goal_id, t.objective_id, t.plan_id, t.observed_at, t.value_num, t.correct, t.total,
       t.prompt_level, t.step_results, t.setting, t.note, t.collector_id, t.device_id,
       t.client_created_at, t.corrects_id`,
    ),
  },
];

// The caller's own assignments, including ended and deleted ones: a tombstone here tells the
// device to purge that student. Directors see all assignments.
const ASSIGNMENTS: EntityQuery = {
  entity: "caseload_assignment",
  sql: `SELECT t.id, t.server_seq AS eff, (t.deleted_at IS NOT NULL) AS deleted, t.staff_id,
               t.student_id, t.relationship, t.start_date, t.end_date
        FROM caseload_assignment t
        WHERE t.server_seq > $2 AND ($1::uuid IS NOT NULL) AND (t.staff_id = $1 OR $4::boolean)
        ORDER BY eff LIMIT $3`,
};

// The caller's own delegations, including revoked ones: a tombstone (or an `expires_at` in the
// past) tells the device to drop that goal's rows, because a revoked goal simply stops appearing.
const DELEGATIONS: EntityQuery = {
  entity: "goal_delegation",
  sql: `SELECT t.id, t.server_seq AS eff, (t.deleted_at IS NOT NULL) AS deleted, t.goal_id, t.staff_id,
               t.expires_at
        FROM goal_delegation t
        WHERE t.server_seq > $2 AND t.staff_id = $1 ORDER BY eff LIMIT $3`,
};

async function fetchSorted(
  c: pg.PoolClient,
  session: Session,
  crypto: FieldCrypto,
  log: Log,
  since: number,
  perEntityLimit: number,
): Promise<Change[]> {
  const tenantWide = session.role === "sped_director" || session.role === "building_coordinator";
  const all: Change[] = [];
  for (const q of [...ENTITIES, ASSIGNMENTS, DELEGATIONS]) {
    const isAssignments = q === ASSIGNMENTS;
    const sql =
      isAssignments || q === DELEGATIONS
        ? q.sql
        : `WITH ${visibleStudentsCte(session)}, ${visibleGoalsCte(session)} ${q.sql}`;
    const params: unknown[] = [session.staffId, since, perEntityLimit];
    if (isAssignments) params.push(tenantWide);
    const res = await c.query<Record<string, unknown>>(sql, params);
    for (const r of res.rows) {
      const { id, eff, deleted, _sid, _gid, ...fields } = r;
      const change: Change = {
        entity: q.entity,
        id: id as string,
        server_seq: Number(eff),
        deleted: deleted as boolean,
      };
      if (typeof _sid === "string") {
        change.scope = { student: _sid, ...(typeof _gid === "string" ? { goal: _gid } : {}) };
      }
      if (!change.deleted) {
        const shaped = q.shape ? q.shape(r, session, crypto, log) : fields;
        if (!shaped) continue;
        change.row = stripNulls(shaped);
      }
      all.push(change);
    }
  }
  return all.sort(
    (x, y) =>
      x.server_seq - y.server_seq || x.entity.localeCompare(y.entity) || x.id.localeCompare(y.id),
  );
}

/** A student joining a caseload sends all their rows at one position, so a page must never end inside such a group. */
const GROUP_LIMIT = 100_000;

/**
 * One page of changes after `since`, merged across entities in position order. Each entity query
 * fetches limit+1 rows, so the merged top `limit` is exact: a row not fetched sorts after every
 * row that was. The cursor is a position, so a page ends only between positions: if the limit
 * would split rows that share one, the page stops before that position, or, when one position
 * alone exceeds the limit, takes the whole position.
 */
export async function pullChanges(
  c: pg.PoolClient,
  session: Session,
  crypto: FieldCrypto,
  log: Log,
  since: number,
  limit: number,
): Promise<{ changes: Change[]; cursor: number; has_more: boolean }> {
  const all = await fetchSorted(c, session, crypto, log, since, limit + 1);
  if (all.length <= limit) {
    const last = all[all.length - 1];
    return { changes: all, cursor: last ? last.server_seq : since, has_more: false };
  }
  let page = all.slice(0, limit);
  const edge = page[page.length - 1]!.server_seq;
  if (all[limit]!.server_seq === edge) {
    const before = page.filter((ch) => ch.server_seq < edge);
    if (before.length > 0) {
      page = before;
    } else {
      const group = await fetchSorted(c, session, crypto, log, edge - 1, GROUP_LIMIT);
      page = group.filter((ch) => ch.server_seq === edge);
    }
  }
  return { changes: page, cursor: page[page.length - 1]!.server_seq, has_more: true };
}

function stripNulls(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
}
