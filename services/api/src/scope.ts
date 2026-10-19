import type { Session } from "./session.ts";

/**
 * "Today" for the school, not the server: School days follow Central time (district
 * facts, 2026-10-17), and the server clock is UTC. Assignments start and end on school dates.
 */
export const SCHOOL_TODAY = "(now() AT TIME ZONE 'America/Chicago')::date";

/**
 * Which students a caller may see. Interim rule until the Cedar policies land: directors and building coordinators see the whole tenant, caseload roles see
 * students with an active assignment, IT admins and vendor support see no student data.
 *
 * Includes soft-deleted students so sync can send their tombstones; readers add their own
 * `deleted_at IS NULL` filter.
 *
 * Returns a CTE named `vis` with one row per visible student: `student_id` and `ca_seq`, the
 * change-feed position of the caller's newest active assignment for that student (0 for
 * tenant-wide roles). `ca_seq` lets sync re-send a student's older rows when the student joins a
 * caseload. `$1` must be bound to the caller's staff id.
 */
export function visibleStudentsCte(session: Session): string {
  switch (session.role) {
    case "sped_director":
    case "building_coordinator":
      return `vis AS (SELECT s.id AS student_id, 0::bigint AS ca_seq FROM student s WHERE $1::uuid IS NOT NULL)`;
    case "case_manager":
    case "related_service_provider":
    case "gen_ed_teacher":
    case "paraprofessional":
      return `vis AS (
        SELECT ca.student_id, max(ca.server_seq) AS ca_seq
        FROM caseload_assignment ca
        WHERE ca.staff_id = $1 AND ca.deleted_at IS NULL
          AND ca.start_date <= ${SCHOOL_TODAY} AND (ca.end_date IS NULL OR ca.end_date >= ${SCHOOL_TODAY})
        GROUP BY ca.student_id)`;
    default:
      return `vis AS (SELECT NULL::uuid AS student_id, 0::bigint AS ca_seq WHERE $1::uuid IS NULL)`;
  }
}

/** Roles whose goal access is limited to goals a case manager delegated to them (role matrix, S3). */
export const DELEGATED_GOALS_ONLY: ReadonlySet<string> = new Set([
  "gen_ed_teacher",
  "paraprofessional",
]);

/**
 * Which goals a caller may see, on top of `visibleStudentsCte` (which must precede it in the same
 * WITH). Gen-ed teachers and paraprofessionals get only goals with a live delegation to them;
 * everyone else gets every goal of a visible student. Returns a CTE `vg(goal_id, student_id,
 * g_seq)`; `g_seq` is the later of the student's assignment position and the newest delegation
 * position, so a newly delegated goal re-sends its older rows. `$1` is the caller's staff id.
 */
export function visibleGoalsCte(session: Session): string {
  if (DELEGATED_GOALS_ONLY.has(session.role)) {
    return `vg AS (
      SELECT g.id AS goal_id, vis.student_id, GREATEST(vis.ca_seq, max(d.server_seq)) AS g_seq
      FROM goal_delegation d
      JOIN goal g ON g.id = d.goal_id
      JOIN iep i ON i.id = g.iep_id
      JOIN vis ON vis.student_id = i.student_id
      WHERE d.staff_id = $1 AND d.deleted_at IS NULL AND (d.expires_at IS NULL OR d.expires_at > now())
      GROUP BY g.id, vis.student_id, vis.ca_seq)`;
  }
  return `vg AS (
    SELECT g.id AS goal_id, vis.student_id, vis.ca_seq AS g_seq
    FROM goal g JOIN iep i ON i.id = g.iep_id JOIN vis ON vis.student_id = i.student_id)`;
}
