import type { Relationship } from "@iep/policies";
import { SCHOOL_TODAY } from "./scope.ts";
import { withTenant, type Db } from "./db.ts";
import type { ScopeResolver } from "./modules/auth/index.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What each role's active assignment means to the policies. */
const ASSIGNED: Partial<Record<string, Relationship>> = {
  case_manager: "caseload",
  related_service_provider: "service",
  gen_ed_teacher: "class_roster",
  paraprofessional: "delegated",
};

/**
 * Resolves how a caller relates to one student, from caseload_assignment and goal_delegation.
 * The client never supplies any of this. Directors see the district; coordinators are treated as
 * district-wide until buildings are modelled (they are tenant-wide in `scope.ts` too). Unknown
 * and other-tenant students both come back as null (RLS hides the other tenant's rows).
 */
export function dbScopeResolver(db: Db): ScopeResolver {
  return {
    async studentScope(principal, studentId) {
      // A malformed id names no student; asking Postgres would raise instead of answering "none".
      if (!UUID.test(studentId)) return null;
      return withTenant(db, principal, async (c) => {
        const st = await c.query("SELECT 1 FROM student WHERE id = $1", [studentId]);
        if (st.rowCount === 0) return null;
        const base = {
          tenantId: principal.tenantId,
          ownService: false,
          delegatedGoalIds: new Set<string>(),
        };
        if (principal.role === "sped_director")
          return { ...base, relationship: "district" as const };
        if (principal.role === "building_coordinator")
          return { ...base, relationship: "building" as const };
        const rel = ASSIGNED[principal.role];
        if (!rel) return { ...base, relationship: "none" as const };
        const ca = await c.query<{ relationship: string }>(
          `SELECT ca.relationship FROM caseload_assignment ca
           WHERE ca.staff_id = $1 AND ca.student_id = $2 AND ca.deleted_at IS NULL
             AND ca.start_date <= ${SCHOOL_TODAY} AND (ca.end_date IS NULL OR ca.end_date >= ${SCHOOL_TODAY})`,
          [principal.staffId, studentId],
        );
        if (ca.rowCount === 0) return { ...base, relationship: "none" as const };
        const del = await c.query<{ goal_id: string }>(
          `SELECT d.goal_id FROM goal_delegation d
           JOIN goal g ON g.id = d.goal_id JOIN iep i ON i.id = g.iep_id
           WHERE d.staff_id = $1 AND i.student_id = $2 AND d.deleted_at IS NULL
             AND (d.expires_at IS NULL OR d.expires_at > now())`,
          [principal.staffId, studentId],
        );
        return {
          ...base,
          relationship: rel,
          ownService: ca.rows.some((r) => r.relationship === "service"),
          delegatedGoalIds: new Set(del.rows.map((r) => r.goal_id)),
        };
      });
    },
  };
}
