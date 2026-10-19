import { beforeAll, describe, expect, it } from "vitest";
import {
  STAFF_ROLES,
  authorizeRequest,
  validatePolicies,
  type Principal,
  type Relationship,
  type StaffRole,
  type StudentAction,
  type StudentContext,
} from "../src/index.ts";

const T = "tenant-a";
const principal = (role: StaffRole, over: Partial<Principal> = {}): Principal => ({
  staffId: `staff-${role}`,
  tenantId: T,
  role,
  active: true,
  aiEnabled: true,
  ...over,
});
const student = { type: "Student", id: "stu-1", tenantId: T } as const;
const check = (
  role: StaffRole,
  action: StudentAction,
  context: StudentContext,
  over: Partial<Principal> = {},
) =>
  authorizeRequest({ principal: principal(role, over), action, resource: student, context })
    .allowed;
const ctx = (
  tier: StudentContext["tier"],
  relationship: Relationship,
  more: Partial<StudentContext> = {},
) => ({
  tier,
  relationship,
  ...more,
});

beforeAll(() => validatePolicies());

describe("policies validate against the schema", () => {
  it("parses in strict mode", () => validatePolicies());
});

// Each block states the matrix row, then proves allow and deny cases.
describe("SPED director", () => {
  it("reads every tier district-wide", () => {
    for (const tier of [1, 2, 3, 4, 5] as const)
      expect(check("sped_director", "ReadSection", ctx(tier, "district"))).toBe(true);
  });
  it("writes S4 and S5 only", () => {
    expect(check("sped_director", "WriteSection", ctx(4, "district"))).toBe(true);
    expect(check("sped_director", "WriteSection", ctx(5, "district"))).toBe(true);
    expect(check("sped_director", "WriteSection", ctx(3, "district"))).toBe(false);
    expect(check("sped_director", "WriteSection", ctx(2, "district"))).toBe(false);
  });
  it("is not scoped to a caseload", () => {
    expect(check("sped_director", "ReadSection", ctx(1, "caseload"))).toBe(false);
    expect(check("sped_director", "ReadSection", ctx(1, "none"))).toBe(false);
  });
  it("manages caseloads, views audit, cannot configure the tenant", () => {
    const base = {
      principal: principal("sped_director"),
      resource: { type: "Tenant", id: T, tenantId: T },
    } as const;
    expect(authorizeRequest({ ...base, action: "ManageCaseload" }).allowed).toBe(true);
    expect(authorizeRequest({ ...base, action: "ViewAuditReport" }).allowed).toBe(true);
    expect(authorizeRequest({ ...base, action: "ConfigureTenant" }).allowed).toBe(false);
  });
  it("can change another person's role but not their own", () => {
    const d = principal("sped_director");
    const other = { type: "Staff", id: "someone-else", tenantId: T, role: "case_manager" } as const;
    expect(authorizeRequest({ principal: d, action: "ChangeRole", resource: other }).allowed).toBe(
      true,
    );
    const self = { type: "Staff", id: d.staffId, tenantId: T, role: "sped_director" } as const;
    expect(authorizeRequest({ principal: d, action: "ChangeRole", resource: self }).allowed).toBe(
      false,
    );
  });
  it("others cannot change roles", () => {
    for (const role of STAFF_ROLES.filter((r) => r !== "sped_director")) {
      const target = { type: "Staff", id: "x", tenantId: T, role: "case_manager" } as const;
      expect(
        authorizeRequest({ principal: principal(role), action: "ChangeRole", resource: target })
          .allowed,
        role,
      ).toBe(false);
    }
  });
});

describe("Building coordinator", () => {
  it("reads all tiers in building, writes S4 only", () => {
    for (const tier of [1, 2, 3, 4, 5] as const)
      expect(check("building_coordinator", "ReadSection", ctx(tier, "building"))).toBe(true);
    expect(check("building_coordinator", "WriteSection", ctx(4, "building"))).toBe(true);
    expect(check("building_coordinator", "WriteSection", ctx(5, "building"))).toBe(false);
    expect(check("building_coordinator", "WriteSection", ctx(3, "building"))).toBe(false);
  });
  it("is denied outside the building", () => {
    expect(check("building_coordinator", "ReadSection", ctx(1, "none"))).toBe(false);
    expect(check("building_coordinator", "ReadSection", ctx(1, "district"))).toBe(false);
  });
});

describe("Case manager", () => {
  it("reads all tiers on own caseload only", () => {
    for (const tier of [1, 2, 3, 4, 5] as const) {
      expect(check("case_manager", "ReadSection", ctx(tier, "caseload"))).toBe(true);
      expect(check("case_manager", "ReadSection", ctx(tier, "none"))).toBe(false);
      expect(check("case_manager", "ReadSection", ctx(tier, "service"))).toBe(false);
    }
  });
  it("writes S2 to S4, never S1, and S5 only for notes they authored", () => {
    expect(check("case_manager", "WriteSection", ctx(1, "caseload"))).toBe(false);
    for (const tier of [2, 3, 4] as const)
      expect(check("case_manager", "WriteSection", ctx(tier, "caseload"))).toBe(true);
    expect(check("case_manager", "WriteSection", ctx(5, "caseload"))).toBe(false);
    expect(check("case_manager", "WriteSection", ctx(5, "caseload", { authored: true }))).toBe(
      true,
    );
    expect(check("case_manager", "WriteSection", ctx(2, "none"))).toBe(false);
  });
  it("adds data, delegates and exports on own caseload only", () => {
    for (const action of ["AddDataPoint", "DelegateGoal", "Export"] as const) {
      expect(check("case_manager", action, ctx(3, "caseload")), action).toBe(true);
      expect(check("case_manager", action, ctx(3, "none")), action).toBe(false);
    }
  });
});

describe("Related-service provider", () => {
  it("reads up to S4 for students they serve; S5 only in their own discipline", () => {
    for (const tier of [1, 2, 3, 4] as const)
      expect(check("related_service_provider", "ReadSection", ctx(tier, "service"))).toBe(true);
    expect(check("related_service_provider", "ReadSection", ctx(5, "service"))).toBe(false);
    expect(
      check("related_service_provider", "ReadSection", ctx(5, "service", { ownService: true })),
    ).toBe(true);
    expect(check("related_service_provider", "ReadSection", ctx(1, "caseload"))).toBe(false);
  });
  it("writes S3 for their own service goals only", () => {
    expect(
      check("related_service_provider", "WriteSection", ctx(3, "service", { ownService: true })),
    ).toBe(true);
    expect(
      check("related_service_provider", "AddDataPoint", ctx(3, "service", { ownService: true })),
    ).toBe(true);
    expect(check("related_service_provider", "WriteSection", ctx(3, "service"))).toBe(false);
    expect(
      check("related_service_provider", "WriteSection", ctx(4, "service", { ownService: true })),
    ).toBe(false);
    expect(
      check("related_service_provider", "Export", ctx(3, "service", { ownService: true })),
    ).toBe(false);
  });
});

describe("General-ed teacher and paraprofessional", () => {
  const cases = [
    ["gen_ed_teacher", "class_roster"],
    ["paraprofessional", "delegated"],
  ] as const;
  for (const [role, rel] of cases) {
    it(`${role}: S1/S2 on scope, S3 and data entry only for delegated goals`, () => {
      expect(check(role, "ReadSection", ctx(1, rel))).toBe(true);
      expect(check(role, "ReadSection", ctx(2, rel))).toBe(true);
      expect(check(role, "ReadSection", ctx(3, rel))).toBe(false);
      expect(check(role, "ReadSection", ctx(3, rel, { delegated: true }))).toBe(true);
      expect(check(role, "ReadSection", ctx(4, rel, { delegated: true }))).toBe(false);
      expect(check(role, "ReadSection", ctx(5, rel, { delegated: true }))).toBe(false);
      expect(check(role, "AddDataPoint", ctx(3, rel, { delegated: true }))).toBe(true);
      expect(check(role, "AddDataPoint", ctx(3, rel))).toBe(false);
    });
    it(`${role}: can do nothing else`, () => {
      for (const action of ["WriteSection", "Export", "DelegateGoal"] as const) {
        expect(check(role, action, ctx(3, rel, { delegated: true })), action).toBe(false);
      }
      expect(check(role, "ReadSection", ctx(1, "none"))).toBe(false);
      expect(check(role, "ReadSection", ctx(1, "caseload"))).toBe(false);
    });
  }
});

describe("IT admin and vendor support", () => {
  it("never reach student data, whatever the context claims", () => {
    for (const role of ["district_it_admin", "vendor_support"] as const) {
      for (const action of [
        "ReadSection",
        "WriteSection",
        "AddDataPoint",
        "Export",
        "UseAi",
        "DelegateGoal",
      ] as const) {
        for (const relationship of [
          "district",
          "building",
          "caseload",
          "service",
          "class_roster",
          "delegated",
        ] as const) {
          expect(
            check(
              role,
              action,
              ctx(1, relationship, { delegated: true, ownService: true, authored: true }),
            ),
            `${role} ${action} ${relationship}`,
          ).toBe(false);
        }
      }
    }
  });
  it("IT admin configures the tenant; vendor support cannot", () => {
    const res = { type: "Tenant", id: T, tenantId: T } as const;
    expect(
      authorizeRequest({
        principal: principal("district_it_admin"),
        action: "ConfigureTenant",
        resource: res,
      }).allowed,
    ).toBe(true);
    expect(
      authorizeRequest({
        principal: principal("vendor_support"),
        action: "ConfigureTenant",
        resource: res,
      }).allowed,
    ).toBe(false);
    expect(
      authorizeRequest({
        principal: principal("district_it_admin"),
        action: "ViewAuditReport",
        resource: res,
      }).allowed,
    ).toBe(false);
  });
});

describe("AI is a separate permission", () => {
  it("needs the tenant setting for the role, plus a scope relationship", () => {
    expect(check("case_manager", "UseAi", ctx(4, "caseload"))).toBe(true);
    expect(check("case_manager", "UseAi", ctx(4, "caseload"), { aiEnabled: false })).toBe(false);
    expect(check("case_manager", "UseAi", ctx(4, "none"))).toBe(false);
    expect(check("related_service_provider", "UseAi", ctx(4, "service"))).toBe(true);
  });
  it("is denied to roles the matrix gives no AI scope", () => {
    expect(check("gen_ed_teacher", "UseAi", ctx(3, "class_roster", { delegated: true }))).toBe(
      false,
    );
    expect(check("paraprofessional", "UseAi", ctx(3, "delegated", { delegated: true }))).toBe(
      false,
    );
  });
});

describe("guards", () => {
  it("a suspended or deprovisioned person is denied everything", () => {
    expect(check("sped_director", "ReadSection", ctx(1, "district"), { active: false })).toBe(
      false,
    );
    expect(check("case_manager", "ReadSection", ctx(1, "caseload"), { active: false })).toBe(false);
  });
  it("cross-tenant access is denied even for a director", () => {
    const d = authorizeRequest({
      principal: principal("sped_director"),
      action: "ReadSection",
      resource: { type: "Student", id: "stu-9", tenantId: "tenant-b" },
      context: ctx(1, "district"),
    });
    expect(d.allowed).toBe(false);
    expect(d.policies).toContain("forbid-cross-tenant");
  });
  it("a malformed request fails closed", () => {
    const d = authorizeRequest({
      principal: principal("case_manager"),
      action: "ReadSection",
      resource: student,
      context: { tier: 9 as never, relationship: "caseload" },
    });
    expect(d.allowed).toBe(false);
  });
  it("names the policy that allowed the request", () => {
    expect(
      authorizeRequest({
        principal: principal("case_manager"),
        action: "ReadSection",
        resource: student,
        context: ctx(2, "caseload"),
      }).policies,
    ).toEqual(["case-manager-read"]);
  });
});
