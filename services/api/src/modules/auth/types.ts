import type { FastifyRequest } from "fastify";
import type { Principal, Relationship, StaffRole } from "@iep/policies";

/** A verified session: who is calling, from which enrolled device. */
export interface AuthContext {
  principal: Principal;
  sessionId: string;
  deviceId: string;
}

/**
 * Turns a request into a verified session, or null. The real implementation (Google ID token,
 * device-bound DPoP access token, refresh rotation) lands with T1-3; tests and demo builds use
 * the demo and mock verifiers. A verifier must never throw for a bad credential, only return null.
 */
export interface SessionVerifier {
  verify(req: FastifyRequest): Promise<AuthContext | null>;
}

/** What the server knows about one caller's relationship to one student (caseload_assignment). */
export interface StudentScope {
  tenantId: string;
  relationship: Relationship;
  /** The provider's own service or discipline covers this student's goals. */
  ownService: boolean;
  /** Goals delegated to the caller for this student. */
  delegatedGoalIds: ReadonlySet<string>;
}

/** Looks up relationships in the database. Returns null when the student does not exist for this tenant. */
export interface ScopeResolver {
  studentScope(principal: Principal, studentId: string): Promise<StudentScope | null>;
}

export interface AuditEvent {
  action: string;
  outcome: "allow" | "deny";
  actorId: string;
  actorRole: StaffRole;
  tenantId: string;
  deviceId: string;
  entityType: "student" | "tenant" | "session";
  entityId: string | null;
  studentId: string | null;
  /** Policy ids that decided the request. */
  policies: string[];
  requestId: string;
}

/** Appends to the hash-chained audit log (T1-4). Rejecting makes the request fail closed. */
export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

export interface AuthDeps {
  sessions: SessionVerifier;
  scopes: ScopeResolver;
  audit: AuditSink;
}
