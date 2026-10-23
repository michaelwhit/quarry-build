import { caseload_assignments, staff } from "@synthetic/fixtures/demo-district.json";
import { roleName } from "./staffList.ts";
import { viewDate } from "./overdue.ts";

// The people on a student's team, read only (made-up staff from the shared demo district).
// A person is on the team while their assignment is current. Nothing leaves the browser.

export interface TeamMember {
  id: string;
  name: string;
  /** Their job title in plain words. */
  role: string;
  /** How they are tied to this student. */
  tie: string;
}

const TIES: Record<string, string> = {
  caseload: "Case manager",
  service: "Provides services",
  class_roster: "Classroom teacher",
  delegated: "Enters data for some goals",
};
const ORDER = ["caseload", "service", "class_roster", "delegated"];

export function teamFor(studentId: string, today: string = viewDate()): TeamMember[] {
  const people = new Map(staff.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const rows: {
    id: string;
    staff_id: string;
    student_id: string;
    relationship: string;
    start_date: string;
    end_date: string | null;
  }[] = caseload_assignments;
  return rows
    .filter(
      (a) =>
        a.student_id === studentId &&
        a.start_date <= today &&
        (a.end_date === null || a.end_date >= today),
    )
    .sort(
      (a, b) =>
        ORDER.indexOf(a.relationship) - ORDER.indexOf(b.relationship) ||
        (people.get(a.staff_id)?.display_name ?? "").localeCompare(
          people.get(b.staff_id)?.display_name ?? "",
        ),
    )
    .flatMap((a) => {
      const p = people.get(a.staff_id);
      const key = `${a.staff_id}/${a.relationship}`;
      if (!p || seen.has(key)) return [];
      seen.add(key);
      return [
        { id: a.id, name: p.display_name, role: roleName(p.role), tie: TIES[a.relationship] ?? "" },
      ];
    });
}
