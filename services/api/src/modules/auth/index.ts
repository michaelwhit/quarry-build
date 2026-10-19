import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  authorizeRequest,
  validatePolicies,
  type Decision,
  type Principal,
  type Relationship,
  type StaffRole,
  type StudentContext,
} from "@iep/policies";
import type { AuthzSpec } from "./endpoints.ts";
import type { AuditEvent, AuthContext, AuthDeps } from "./types.ts";

export { authzFor, ENDPOINT_AUTHZ, type AuthzSpec, type OperationId } from "./endpoints.ts";
export type * from "./types.ts";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the auth hook on every non-public request. */
    auth?: AuthContext;
  }
  interface FastifyContextConfig {
    /** Required on every route registered after the auth module, unless it is a public path. */
    authz?: AuthzSpec;
  }
  interface FastifyInstance {
    /**
     * For handlers that authorize each item of a batch. Writes the same audit event. "error"
     * means the policy or audit step failed: callers must fail the request, never treat it as a
     * denial.
     */
    authorizeItem(
      req: FastifyRequest,
      spec: Extract<AuthzSpec, { kind: "student" }>,
      studentId: string,
      goalId?: string,
    ): Promise<"allow" | "deny" | "not_found" | "error">;
  }
}

/** Routes that need no session. Everything else is denied until a real session check passes. */
const PUBLIC_PATHS = new Set(["/healthz"]);
const PUBLIC_METHODS = new Set(["GET", "HEAD"]);
const isPublic = (method: string | readonly string[], path: string) =>
  PUBLIC_PATHS.has(path) && [method].flat().every((m) => PUBLIC_METHODS.has(m));

/** Best-case relationship for each role, used for list routes whose handler filters rows. */
const LIST_RELATIONSHIP: Record<StaffRole, Relationship> = {
  sped_director: "district",
  building_coordinator: "building",
  case_manager: "caseload",
  related_service_provider: "service",
  gen_ed_teacher: "class_roster",
  paraprofessional: "delegated",
  district_it_admin: "none",
  vendor_support: "none",
};

const problem = (reply: FastifyReply, status: 401 | 403 | 404 | 503, title: string) =>
  reply.code(status).type("application/problem+json").send({ type: "about:blank", title, status });

/**
 *
 * - onRequest: public allowlist, otherwise a verified session or 401. An allowlist, not a /v0
 *   prefix match, so a differently shaped path can never skip the check. App-wide (fastify-plugin)
 *   so it covers later modules and unknown paths, which must never reveal what exists.
 * - onRoute: every route registered after this module must declare `config.authz`, or the
 *   server refuses to start. Forgetting authorization is a startup error, not a data leak.
 * - preHandler (added per route): evaluates the Cedar policies with the caller's relationship
 *   to the student, writes an audit event for the decision, and fails closed if that write fails.
 */
export function createAuthModule(deps: AuthDeps) {
  // A broken policy file must stop the server at startup, not surface on the first request.
  validatePolicies();
  const plugin: FastifyPluginAsync = async (app) => {
    async function audit(
      req: FastifyRequest,
      auth: AuthContext,
      e: Pick<
        AuditEvent,
        "action" | "outcome" | "entityType" | "entityId" | "studentId" | "policies"
      >,
    ) {
      await deps.audit.record({
        ...e,
        actorId: auth.principal.staffId,
        actorRole: auth.principal.role,
        tenantId: auth.principal.tenantId,
        deviceId: auth.deviceId,
        requestId: req.id,
      });
    }

    async function decideStudent(
      req: FastifyRequest,
      auth: AuthContext,
      spec: Extract<AuthzSpec, { kind: "student" }>,
      studentId: string,
      goalId?: string,
    ): Promise<"allow" | "deny" | "not_found"> {
      const scope = await deps.scopes.studentScope(auth.principal, studentId);
      // No student, another tenant's student, or no relationship at all: all look like "not found".
      if (!scope || scope.relationship === "none") {
        await audit(req, auth, {
          action: spec.action,
          outcome: "deny",
          entityType: "student",
          entityId: studentId,
          studentId,
          policies: [],
        });
        return "not_found";
      }
      const context: StudentContext = {
        tier: spec.tier,
        relationship: scope.relationship,
        delegated: goalId !== undefined && scope.delegatedGoalIds.has(goalId),
        ownService: scope.ownService,
      };
      const d = authorizeRequest({
        principal: auth.principal,
        action: spec.action,
        resource: { type: "Student", id: studentId, tenantId: scope.tenantId },
        context,
      });
      await audit(req, auth, {
        action: spec.action,
        outcome: d.allowed ? "allow" : "deny",
        entityType: "student",
        entityId: studentId,
        studentId,
        policies: d.policies,
      });
      return d.allowed ? "allow" : "deny";
    }

    app.addHook("onRequest", async (req, reply) => {
      const path = req.url.split("?", 1)[0] ?? "";
      if (isPublic(req.method, path)) return;
      // A verifier error is a failed check, never a pass.
      const auth = await deps.sessions.verify(req).catch(() => null);
      if (!auth || !auth.principal.active) return problem(reply, 401, "Unauthorized");
      req.auth = auth;
    });

    app.addHook("onRoute", (route) => {
      if (isPublic(route.method, route.url)) return;
      const spec = route.config?.authz;
      if (!spec) {
        throw new Error(
          `Route ${String(route.method)} ${route.url} has no config.authz (deny by default)`,
        );
      }
      const existing = route.preHandler ? [route.preHandler].flat() : [];
      route.preHandler = [
        async (req: FastifyRequest, reply: FastifyReply) => {
          const auth = req.auth;
          if (!auth) return problem(reply, 401, "Unauthorized");
          try {
            switch (spec.kind) {
              case "session":
              case "per-item":
                return;
              case "student": {
                const id = (req.params as Record<string, string>)[spec.param ?? "studentId"];
                if (!id) return problem(reply, 404, "Not Found");
                const goalId = (req.params as Record<string, string>)["goalId"];
                const r = await decideStudent(req, auth, spec, id, goalId);
                if (r === "not_found") return problem(reply, 404, "Not Found");
                if (r === "deny") return problem(reply, 403, "Forbidden");
                return;
              }
              case "list": {
                const d: Decision = authorizeRequest({
                  principal: auth.principal,
                  action: spec.action,
                  resource: { type: "Student", id: "list", tenantId: auth.principal.tenantId },
                  context: {
                    tier: spec.tier,
                    relationship: LIST_RELATIONSHIP[auth.principal.role],
                  },
                });
                await audit(req, auth, {
                  action: `List:${spec.action}`,
                  outcome: d.allowed ? "allow" : "deny",
                  entityType: "student",
                  entityId: null,
                  studentId: null,
                  policies: d.policies,
                });
                if (!d.allowed) return problem(reply, 403, "Forbidden");
                return;
              }
              case "tenant": {
                const d = authorizeRequest({
                  principal: auth.principal,
                  action: spec.action,
                  resource: {
                    type: "Tenant",
                    id: auth.principal.tenantId,
                    tenantId: auth.principal.tenantId,
                  },
                });
                await audit(req, auth, {
                  action: spec.action,
                  outcome: d.allowed ? "allow" : "deny",
                  entityType: "tenant",
                  entityId: auth.principal.tenantId,
                  studentId: null,
                  policies: d.policies,
                });
                if (!d.allowed) return problem(reply, 403, "Forbidden");
                return;
              }
            }
          } catch (err) {
            // Audit or policy lookup failed: the request does not proceed.
            req.log.error({ err: (err as Error).name }, "authorization failed closed");
            return problem(reply, 503, "Service Unavailable");
          }
        },
        ...existing,
      ];
    });

    app.decorate("authorizeItem", async (req, spec, studentId, goalId) => {
      if (!req.auth) return "deny";
      try {
        return await decideStudent(req, req.auth, spec, studentId, goalId);
      } catch {
        return "error";
      }
    });
  };
  return fp(plugin, { name: "auth" });
}

/** Default dependencies: nobody can sign in. Real and demo verifiers are injected by the server entrypoint. */
export const denyAllDeps: AuthDeps = {
  sessions: { verify: async () => null },
  scopes: { studentScope: async () => null },
  audit: {
    record: async () => {
      throw new Error("no audit sink configured");
    },
  },
};

export type { Principal };
