import type { StudentAction, TenantAction } from "@iep/policies";

/**
 * How one route is authorized. Every non-public route must declare one, either by name from
 * ENDPOINT_AUTHZ (below) or inline; a route with none fails at registration.
 */
export type AuthzSpec =
  /** Any verified session; the handler returns only the caller's own data (/v0/me). */
  | { kind: "session" }
  /** A single student named by a path parameter. Unknown or out-of-scope students answer 404. */
  | { kind: "student"; action: StudentAction; tier: 1 | 2 | 3 | 4 | 5; param?: string }
  /** A list the handler filters by relationship. Entry check: the role may read this tier at all. */
  | { kind: "list"; action: "ReadSection"; tier: 1 | 2 | 3 | 4 | 5 }
  /** Tenant administration. */
  | { kind: "tenant"; action: TenantAction }
  /**
   * The handler authorizes each item itself (sync batches). The change feed and goals read use
   * authorizeItem. syncPush does not yet: it checks role, visible-student scope and delegation at
   * the recording time in SQL (modules/sync/push.ts), which is stricter than the Cedar AddDataPoint
   * rule today but is not the Cedar authority. Tracked in packages/policies/README.md.
   */
  | { kind: "per-item" };

/**
 * Authorization for every operation in packages/openapi/api.yaml, keyed by operationId.
 * A test fails when the contract gains a secured operation with no entry here, or this table
 * keeps an entry for an operation that no longer exists.
 */
export const ENDPOINT_AUTHZ = {
  getMe: { kind: "session" },
  listStudents: { kind: "list", action: "ReadSection", tier: 1 },
  listStudentGoals: { kind: "student", action: "ReadSection", tier: 2, param: "studentId" },
  syncPush: { kind: "per-item" },
  syncChanges: { kind: "per-item" },
  // Roster, caseload and calendar administration: directors and building coordinators.
  importStudents: { kind: "tenant", action: "ManageCaseload" },
  importCaseloads: { kind: "tenant", action: "ManageCaseload" },
  addReportingPeriods: { kind: "tenant", action: "ManageCaseload" },
  addInstructionalDays: { kind: "tenant", action: "ManageCaseload" },
} as const satisfies Record<string, AuthzSpec>;

export type OperationId = keyof typeof ENDPOINT_AUTHZ;

export function authzFor(operationId: OperationId): AuthzSpec {
  return ENDPOINT_AUTHZ[operationId];
}
