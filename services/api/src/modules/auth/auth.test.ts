import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { STAFF_ROLES, type Principal, type StaffRole } from "@iep/policies";
import { buildApp } from "../../app.ts";
import { loadConfig } from "../../config.ts";
import {
  ENDPOINT_AUTHZ,
  authzFor,
  createAuthModule,
  type AuditEvent,
  type AuthDeps,
  type OperationId,
} from "./index.ts";

const TENANT = "tenant-a";
const STUDENT_MINE = "stu-in-scope";
const STUDENT_OTHER = "stu-out-of-scope";
const STUDENT_OTHER_TENANT = "stu-other-tenant";

const principalFor = (role: StaffRole, over: Partial<Principal> = {}): Principal => ({
  staffId: `staff-${role}`,
  tenantId: TENANT,
  role,
  active: true,
  aiEnabled: true,
  ...over,
});

const REL: Record<
  StaffRole,
  "district" | "building" | "caseload" | "service" | "class_roster" | "delegated" | "none"
> = {
  sped_director: "district",
  building_coordinator: "building",
  case_manager: "caseload",
  related_service_provider: "service",
  gen_ed_teacher: "class_roster",
  paraprofessional: "delegated",
  district_it_admin: "none",
  vendor_support: "none",
};

function makeDeps(opts: { failAudit?: boolean; events?: AuditEvent[] } = {}): AuthDeps {
  return {
    sessions: {
      // Test bearer token format: "role" or "role:inactive".
      async verify(req) {
        const token = req.headers.authorization?.replace(/^Bearer /, "");
        if (!token) return null;
        if (token === "throw") throw new Error("verifier blew up");
        const [role, flag] = token.split(":");
        if (!STAFF_ROLES.includes(role as StaffRole)) return null;
        return {
          principal: principalFor(role as StaffRole, { active: flag !== "inactive" }),
          sessionId: "sess-1",
          deviceId: "dev-1",
        };
      },
    },
    scopes: {
      async studentScope(p, studentId) {
        if (studentId === STUDENT_OTHER_TENANT) return null;
        if (studentId === STUDENT_OTHER)
          return {
            tenantId: TENANT,
            relationship: "none",
            ownService: false,
            delegatedGoalIds: new Set(),
          };
        if (studentId !== STUDENT_MINE) return null;
        return {
          tenantId: TENANT,
          relationship: REL[p.role],
          ownService: false,
          delegatedGoalIds: new Set(),
        };
      },
    },
    audit: {
      async record(e) {
        if (opts.failAudit) throw new Error("audit store down");
        opts.events?.push(e);
      },
    },
  };
}

type Spec = {
  paths: Record<string, Record<string, { operationId: string; security?: unknown[] }>>;
  security?: unknown[];
};
const spec = parse(
  await readFile(new URL("../../../../../packages/openapi/api.yaml", import.meta.url), "utf8"),
) as Spec;
const securedOps = Object.entries(spec.paths).flatMap(([path, ops]) =>
  Object.entries(ops)
    .filter(([, op]) => (op.security ?? spec.security ?? []).length > 0)
    .map(([method, op]) => ({
      method: method.toUpperCase() as "GET" | "POST",
      path,
      operationId: op.operationId,
    })),
);

/** The real auth module with a stub handler on every contract route, authorized from the real table. */
async function stubApp(deps: AuthDeps) {
  const app = Fastify();
  await app.register(createAuthModule(deps));
  for (const op of securedOps) {
    app.route({
      method: op.method,
      url: op.path.replace(/\{([^}]+)\}/g, ":$1"),
      config: { authz: authzFor(op.operationId as OperationId) },
      handler: async () => ({ ok: true }),
    });
  }
  return app;
}

const call = (
  app: Awaited<ReturnType<typeof stubApp>>,
  op: (typeof securedOps)[number],
  token?: string,
  studentId = STUDENT_MINE,
) =>
  app.inject({
    method: op.method,
    url: `${op.path.replace(/\{[^}]+\}/g, studentId)}?since=0`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(op.method === "POST" ? { payload: { mutations: [] } } : {}),
  });

describe("endpoint coverage", () => {
  it("every secured operation in the contract has an authorization entry, and none is stale", () => {
    const secured = new Set(securedOps.map((o) => o.operationId));
    expect([...secured].filter((id) => !(id in ENDPOINT_AUTHZ))).toEqual([]);
    expect(Object.keys(ENDPOINT_AUTHZ).filter((id) => !secured.has(id))).toEqual([]);
  });

  it("a route with no authz declaration stops the server from starting", async () => {
    const app = Fastify();
    await app.register(createAuthModule(makeDeps()));
    expect(() => app.get("/v0/forgot", async () => ({}))).toThrow(/no config\.authz/);
  });
});

describe("public path", () => {
  it("is public for GET only: a POST to /healthz needs authz and a session", async () => {
    const app = Fastify();
    await app.register(createAuthModule(makeDeps()));
    expect(() => app.post("/healthz", async () => ({}))).toThrow(/no config\.authz/);
    app.get("/healthz", async () => ({ ok: true }));
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/healthz" })).statusCode).toBe(401);
  });
});

describe("authentication", () => {
  it("rejects missing, unknown, inactive and erroring credentials with 401 on every operation", async () => {
    const app = await stubApp(makeDeps());
    for (const op of securedOps) {
      for (const token of [undefined, "nonsense", "case_manager:inactive", "throw"]) {
        const res = await call(app, op, token);
        expect(res.statusCode, `${op.operationId} ${token}`).toBe(401);
      }
    }
  });

  it("buildApp with default dependencies denies everyone", async () => {
    const app = await buildApp(loadConfig({ IEP_DATA_CLASS: "synthetic" }));
    const res = await app.inject({
      method: "GET",
      url: "/v0/me",
      headers: { authorization: "Bearer sped_director" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// Expected outcome per role for each contract operation, written out so a reviewer can read it.
const EXPECTED: Record<string, Record<StaffRole, number>> = {
  getMe: allRoles(200),
  listStudents: { ...allRoles(200), district_it_admin: 403, vendor_support: 403 },
  // Goal text is S2: every student-facing role with a relationship may read it.
  listStudentGoals: { ...allRoles(200), district_it_admin: 404, vendor_support: 404 },
  syncPush: allRoles(200), // each mutation is authorized inside the sync module
  syncChanges: allRoles(200),
  // Roster, caseload and calendar administration (ManageCaseload): directors and coordinators.
  importStudents: manageCaseload(),
  importCaseloads: manageCaseload(),
  addReportingPeriods: manageCaseload(),
  addInstructionalDays: manageCaseload(),
};
function manageCaseload(): Record<StaffRole, number> {
  return {
    ...allRoles(403),
    sped_director: 200,
    building_coordinator: 200,
  };
}
function allRoles(status: number): Record<StaffRole, number> {
  return Object.fromEntries(STAFF_ROLES.map((r) => [r, status])) as Record<StaffRole, number>;
}

describe("per-role allow and deny for every endpoint", () => {
  for (const op of securedOps) {
    for (const role of STAFF_ROLES) {
      it(`${op.method} ${op.path} as ${role}`, async () => {
        const app = await stubApp(makeDeps());
        const want = EXPECTED[op.operationId]?.[role];
        expect(want, "no expectation written for this operation").toBeDefined();
        expect((await call(app, op, role)).statusCode).toBe(want);
      });
    }
  }

  it("a student with no relationship, a missing student and another tenant's student all answer 404", async () => {
    const app = await stubApp(makeDeps());
    const op = securedOps.find((o) => o.operationId === "listStudentGoals")!;
    for (const id of [STUDENT_OTHER, "does-not-exist", STUDENT_OTHER_TENANT]) {
      expect((await call(app, op, "sped_director", id)).statusCode, id).toBe(404);
    }
  });

  it("a real relationship but a policy deny answers 403", async () => {
    const app = Fastify();
    await app.register(createAuthModule(makeDeps()));
    app.get(
      "/s/:studentId",
      { config: { authz: { kind: "student", action: "ReadSection", tier: 5 } } },
      async () => ({}),
    );
    const get = (token: string) =>
      app.inject({
        method: "GET",
        url: `/s/${STUDENT_MINE}`,
        headers: { authorization: `Bearer ${token}` },
      });
    expect((await get("case_manager")).statusCode).toBe(200);
    expect((await get("gen_ed_teacher")).statusCode).toBe(403);
    expect((await get("paraprofessional")).statusCode).toBe(403);
  });

  it("tenant routes follow the policy", async () => {
    const app = Fastify();
    await app.register(createAuthModule(makeDeps()));
    app.get(
      "/admin",
      { config: { authz: { kind: "tenant", action: "ConfigureTenant" } } },
      async () => ({}),
    );
    const get = (token: string) =>
      app.inject({ method: "GET", url: "/admin", headers: { authorization: `Bearer ${token}` } });
    expect((await get("district_it_admin")).statusCode).toBe(200);
    for (const r of STAFF_ROLES.filter((x) => x !== "district_it_admin"))
      expect((await get(r)).statusCode, r).toBe(403);
  });
});

describe("audit", () => {
  it("records allow and deny decisions with actor, device, request and policies", async () => {
    const events: AuditEvent[] = [];
    const app = await stubApp(makeDeps({ events }));
    const op = securedOps.find((o) => o.operationId === "listStudentGoals")!;
    await call(app, op, "case_manager");
    await call(app, op, "district_it_admin");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      action: "ReadSection",
      outcome: "allow",
      actorId: "staff-case_manager",
      actorRole: "case_manager",
      tenantId: TENANT,
      deviceId: "dev-1",
      studentId: STUDENT_MINE,
      policies: ["case-manager-read"],
    });
    expect(events[1]).toMatchObject({ outcome: "deny", actorRole: "district_it_admin" });
  });

  it("fails closed when the audit write fails: no handler runs, answer is 503", async () => {
    const app = Fastify();
    await app.register(createAuthModule(makeDeps({ failAudit: true })));
    let ran = false;
    app.get(
      "/s/:studentId",
      { config: { authz: { kind: "student", action: "ReadSection", tier: 1 } } },
      async () => {
        ran = true;
        return {};
      },
    );
    const res = await app.inject({
      method: "GET",
      url: `/s/${STUDENT_MINE}`,
      headers: { authorization: "Bearer case_manager" },
    });
    expect(res.statusCode).toBe(503);
    expect(ran).toBe(false);
  });

  it("authorizeItem gives per-item decisions and audits them", async () => {
    const events: AuditEvent[] = [];
    const app = Fastify();
    await app.register(createAuthModule(makeDeps({ events })));
    app.post("/batch", { config: { authz: { kind: "per-item" } } }, async (req) => {
      const s = { kind: "student", action: "AddDataPoint", tier: 3 } as const;
      return [
        await app.authorizeItem(req, s, STUDENT_MINE, "g1"),
        await app.authorizeItem(req, s, STUDENT_OTHER, "g1"),
        await app.authorizeItem(req, s, "ghost", "g1"),
      ];
    });
    const res = await app.inject({
      method: "POST",
      url: "/batch",
      headers: { authorization: "Bearer case_manager" },
      payload: {},
    });
    expect(res.json()).toEqual(["allow", "not_found", "not_found"]);
    expect(events).toHaveLength(3);
  });

  it("authorizeItem answers error, not deny, when the audit step fails", async () => {
    const app = Fastify();
    await app.register(createAuthModule(makeDeps({ failAudit: true })));
    app.post("/batch", { config: { authz: { kind: "per-item" } } }, async (req) =>
      app.authorizeItem(
        req,
        { kind: "student", action: "AddDataPoint", tier: 3 },
        STUDENT_MINE,
        "g1",
      ),
    );
    const res = await app.inject({
      method: "POST",
      url: "/batch",
      headers: { authorization: "Bearer case_manager" },
      payload: {},
    });
    expect(res.body).toBe("error");
  });
});
