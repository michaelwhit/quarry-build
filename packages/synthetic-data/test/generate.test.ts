import { describe, expect, it } from "vitest";
import { generateDistrict } from "../src/index.ts";

const uuidv7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("synthetic district", () => {
  const d = generateDistrict();

  it("is deterministic for a seed", () => {
    expect(JSON.stringify(generateDistrict())).toBe(JSON.stringify(d));
    expect(JSON.stringify(generateDistrict({ seed: 1 }))).not.toBe(JSON.stringify(d));
  });

  it("is marked synthetic everywhere it can be", () => {
    expect(d.synthetic).toBe(true);
    expect(d.tenant.is_synthetic).toBe(true);
    expect(d.tenant.name).toMatch(/synthetic/);
    for (const s of d.students) {
      expect(s.local_student_id).toMatch(/^SYN-/);
      expect(s.state_student_id).toMatch(/^SYN-/);
    }
    for (const s of d.staff) expect(s.email).toMatch(/@bluestem\.example$/);
  });

  it("uses valid, unique UUIDv7 ids", () => {
    const ids = [
      d.tenant.id,
      ...d.schools.map((x) => x.id),
      ...d.staff.map((x) => x.id),
      ...d.students.map((x) => x.id),
      ...d.ieps.map((x) => x.id),
      ...d.goals.map((x) => x.id),
      ...d.measurement_plans.map((x) => x.id),
      ...d.data_points.map((x) => x.id),
      ...d.caseload_assignments.map((x) => x.id),
    ];
    for (const id of ids) expect(id).toMatch(uuidv7);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps references consistent", () => {
    const goalIds = new Set(d.goals.map((g) => g.id));
    const planIds = new Set(d.measurement_plans.map((p) => p.id));
    const staffIds = new Set(d.staff.map((s) => s.id));
    for (const p of d.data_points) {
      expect(goalIds.has(p.goal_id)).toBe(true);
      expect(planIds.has(p.plan_id)).toBe(true);
      expect(staffIds.has(p.collector_id)).toBe(true);
      if (p.correct !== null && p.total !== null) expect(p.correct).toBeLessThanOrEqual(p.total);
    }
    for (const a of d.caseload_assignments) expect(a.granted_by).not.toBe(a.staff_id);
  });

  it("gives every student a case manager and goals with data", () => {
    for (const s of d.students) {
      expect(
        d.caseload_assignments.some((a) => a.student_id === s.id && a.relationship === "caseload"),
      ).toBe(true);
      const iep = d.ieps.find((i) => i.student_id === s.id)!;
      const goals = d.goals.filter((g) => g.iep_id === iep.id);
      expect(goals.length).toBeGreaterThanOrEqual(2);
      for (const g of goals) expect(d.data_points.some((p) => p.goal_id === g.id)).toBe(true);
    }
  });
});
