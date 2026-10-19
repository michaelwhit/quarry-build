import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// The nodejs build loads its wasm synchronously, which suits a request path.
const cedar =
  require("@cedar-policy/cedar-wasm/nodejs") as typeof import("@cedar-policy/cedar-wasm/nodejs");

export const STAFF_ROLES = [
  "sped_director",
  "building_coordinator",
  "case_manager",
  "related_service_provider",
  "gen_ed_teacher",
  "paraprofessional",
  "district_it_admin",
  "vendor_support",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** How the caller relates to one student, resolved by the server from caseload_assignment. */
export type Relationship =
  "district" | "building" | "caseload" | "service" | "class_roster" | "delegated" | "none";

const RELATIONSHIPS: readonly string[] = [
  "district",
  "building",
  "caseload",
  "service",
  "class_roster",
  "delegated",
  "none",
];

export type StudentAction =
  "ReadSection" | "WriteSection" | "AddDataPoint" | "Export" | "UseAi" | "DelegateGoal";
export type TenantAction = "ManageCaseload" | "ViewAuditReport" | "ConfigureTenant";
export type Action = StudentAction | TenantAction | "ChangeRole";

export interface Principal {
  staffId: string;
  tenantId: string;
  role: StaffRole;
  active: boolean;
  aiEnabled: boolean;
}

export interface StudentContext {
  /** Section sensitivity, 1 (S1) to 5 (S5). */
  tier: 1 | 2 | 3 | 4 | 5;
  relationship: Relationship;
  delegated?: boolean;
  ownService?: boolean;
  authored?: boolean;
}

export type Request =
  | {
      principal: Principal;
      action: StudentAction;
      resource: { type: "Student"; id: string; tenantId: string };
      context: StudentContext;
    }
  | {
      principal: Principal;
      action: TenantAction;
      resource: { type: "Tenant"; id: string; tenantId: string };
    }
  | {
      principal: Principal;
      action: "ChangeRole";
      resource: { type: "Staff"; id: string; tenantId: string; role: StaffRole };
      context?: never;
    };

export interface Decision {
  allowed: boolean;
  /** Ids of the permit policies that matched (and forbid policies, when denied by one). */
  policies: string[];
}

const dir = new URL("../cedar/", import.meta.url);
const schema = readFileSync(new URL("iep.cedarschema", dir), "utf8");
const policyText = readFileSync(new URL("iep.cedar", dir), "utf8");

/** One entry per policy, keyed by its @id annotation so decisions can name the policy that fired. */
const policies: Record<string, string> = Object.fromEntries(
  [...policyText.matchAll(/@id\("([^"]+)"\)\s*((?:permit|forbid)[\s\S]*?;)/g)].map((m) => [
    m[1]!,
    m[2]!,
  ]),
);
const declared = (policyText.match(/^@id\(/gm) ?? []).length;
if (declared === 0 || Object.keys(policies).length !== declared) {
  throw new Error("Every Cedar policy needs a unique @id annotation");
}

function staffEntity(
  id: string,
  tenantId: string,
  role: string,
  active: boolean,
  aiEnabled: boolean,
) {
  return {
    uid: { type: "Staff", id },
    attrs: { role, tenant: tenantId, active, aiEnabled },
    parents: [],
  };
}

/** Throws when the policies do not parse or do not validate against the schema. */
export function validatePolicies(): void {
  const r = cedar.validate({
    validationSettings: { mode: "strict" },
    schema,
    policies: { staticPolicies: policies },
  });
  if (r.type === "failure") throw new Error(`Cedar parse failure: ${JSON.stringify(r.errors)}`);
  if (r.validationErrors.length > 0)
    throw new Error(`Cedar validation: ${JSON.stringify(r.validationErrors)}`);
}

export function authorizeRequest(req: Request): Decision {
  const { principal, action, resource } = req;
  const entities = [
    staffEntity(
      principal.staffId,
      principal.tenantId,
      principal.role,
      principal.active,
      principal.aiEnabled,
    ),
  ];
  let context: Record<string, unknown> = {};
  if (resource.type === "Staff") {
    entities.push(staffEntity(resource.id, resource.tenantId, resource.role, true, false));
    context = { self: resource.id === principal.staffId };
  } else {
    entities.push({
      uid: { type: resource.type, id: resource.id },
      attrs: { tenant: resource.tenantId },
      parents: [],
    } as never);
    if (resource.type === "Student") {
      const c = (req as Extract<Request, { resource: { type: "Student" } }>).context;
      // Cedar's Long accepts any integer, so the tier range and relationship names are checked here.
      if (![1, 2, 3, 4, 5].includes(c.tier) || !RELATIONSHIPS.includes(c.relationship)) {
        return { allowed: false, policies: [] };
      }
      context = {
        tier: c.tier,
        relationship: c.relationship,
        delegated: c.delegated ?? false,
        ownService: c.ownService ?? false,
        authored: c.authored ?? false,
      };
    }
  }
  const answer = cedar.isAuthorized({
    principal: { type: "Staff", id: principal.staffId },
    action: { type: "Action", id: action },
    resource: { type: resource.type, id: resource.id },
    context,
    schema,
    validateRequest: true,
    policies: { staticPolicies: policies },
    entities,
  } as never);
  if (answer.type === "failure") {
    // Malformed requests fail closed.
    return { allowed: false, policies: [] };
  }
  return {
    allowed: answer.response.decision === "allow",
    policies: answer.response.diagnostics.reason,
  };
}
