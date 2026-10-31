import {
  caseload_assignments,
  goal_delegations,
  goals,
  ieps,
  schools,
  staff,
  students,
} from "@synthetic/fixtures/demo-district.json";
import { isoToday } from "./overdue.ts";

// The director's Staff and roles list and "who can see student records" list. Read only, made up:
// it reads the shared demo district's staff, and nothing leaves the browser. The wording and the
// CSV follow the native app (StaffRolesText, AccessRosterRow).

export type StaffFilter = "all" | "case_managers" | "providers" | "paras";

export const FILTERS: { id: StaffFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "case_managers", label: "Case managers" },
  { id: "providers", label: "SLP / psych" },
  { id: "paras", label: "Paras" },
];

export interface StaffRow {
  id: string;
  name: string;
  role: string;
  /** Building, or "District office" for the director. */
  position: string;
  /** "6 students", "2 delegated goals · ends Jun 2027", or "" for the director. */
  detail: string;
  /** Only active people may see student records; a paused person stays on the list. */
  status: "active" | "paused";
  /** "Role ends Jun 2027" when the roster gives an end date, otherwise "". */
  roleEnds: string;
}

/** The roster fields this list reads; the end date is absent from the practice district. */
export interface StaffPerson {
  id: string;
  display_name: string;
  role: string;
  status: string;
  role_end_date?: string | null;
}

const ROLE_NAMES: Record<string, string> = {
  sped_director: "SPED director",
  case_manager: "Case manager",
  related_service_provider: "SLP / psych",
  paraprofessional: "Para",
  gen_ed_teacher: "General-education teacher",
};

const ROLE_ORDER = [
  "sped_director",
  "case_manager",
  "related_service_provider",
  "paraprofessional",
];

export const roleName = (role: string): string => ROLE_NAMES[role] ?? role;

/** One line saying what each role may see. */
export const ROLE_LINES: Record<string, string> = {
  sped_director: "Sees every student and staff member, and sets roles.",
  case_manager:
    "Works with the full records of their own caseload and can give data entry to a para.",
  related_service_provider: "Sees what they need for their service, for the students they serve.",
  paraprofessional: "Records data on the goals a teacher gives them. Nothing else.",
  gen_ed_teacher: "Sees a read-only At a glance for the goals a case manager gives them.",
};

export const STATUS_WORDS: Record<StaffRow["status"], string> = {
  active: "Active",
  paused: "Paused",
};

export const TEXT = {
  title: "Staff and roles",
  searchLabel: "Search staff",
  roleHelp: "Role is set by you. Role changes are made in the full app; this view is read only.",
  empty: "No staff match.",
  pausedLine: "Access is paused.",
  rosterTitle: "Who can see student records",
  rosterNote: "Keep this list current. It shows who may see student records.",
  rosterExport: "Export who can see student records",
  saveCsv: "Save as CSV",
};

/** An assignment or delegation with no end date, or one ending today or later, is active. */
const activeOn = (end: string | null, today: string): boolean => end === null || end >= today;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string): string =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Staff rows from the demo district, director first, then by role, then by name. */
export function staffRows(
  today: string = isoToday(),
  people: readonly StaffPerson[] = staff,
): StaffRow[] {
  const schoolName = new Map(schools.map((s) => [s.id, s.name.replace(" (synthetic)", "")]));
  const studentSchool = new Map(students.map((s) => [s.id, s.school_id]));
  const iepStudent = new Map(ieps.map((i) => [i.id, i.student_id]));
  const goalStudent = new Map(goals.map((g) => [g.id, iepStudent.get(g.iep_id)]));
  const rows = people
    .filter((p) => p.status === "active" || p.status === "paused")
    .map((p): StaffRow => {
      const mine = caseload_assignments.filter(
        (a) => a.staff_id === p.id && activeOn(a.end_date, today),
      );
      const delegated = goal_delegations.filter(
        (d) => d.staff_id === p.id && activeOn(d.expires_at, today),
      );
      const buildingIds = new Set<string>();
      for (const a of mine) {
        const id = studentSchool.get(a.student_id);
        if (id) buildingIds.add(id);
      }
      for (const d of delegated) {
        const sid = goalStudent.get(d.goal_id);
        const id = sid ? studentSchool.get(sid) : undefined;
        if (id) buildingIds.add(id);
      }
      const buildings = [...buildingIds]
        .map((id) => schoolName.get(id) ?? "")
        .filter((n) => n !== "")
        .sort();
      let position = buildings.join(" and ");
      if (position === "")
        position = p.role === "sped_director" ? "District office" : "Practice district";
      let detail = "";
      if (p.role === "case_manager" || p.role === "related_service_provider")
        detail = plural(new Set(mine.map((a) => a.student_id)).size, "student", "students");
      else if (p.role === "paraprofessional" || p.role === "gen_ed_teacher") {
        detail = plural(delegated.length, "delegated goal", "delegated goals");
        const ends = delegated.flatMap((d) => (d.expires_at ? [d.expires_at] : [])).sort();
        if (ends[0]) detail += ` · ends ${monthYear(ends[0])}`;
      }
      const status = p.status === "paused" ? "paused" : "active";
      const roleEnds = p.role_end_date ? `Role ends ${monthYear(p.role_end_date)}` : "";
      return { id: p.id, name: p.display_name, role: p.role, position, detail, status, roleEnds };
    });
  const rank = (r: string) => {
    const i = ROLE_ORDER.indexOf(r);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  return rows.sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));
}

/** Search by name and filter by role, as the native list does. */
export function filterStaff(rows: StaffRow[], filter: StaffFilter, search: string): StaffRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (q !== "" && !r.name.toLowerCase().includes(q)) return false;
    if (filter === "case_managers") return r.role === "case_manager";
    if (filter === "providers") return r.role === "related_service_provider";
    if (filter === "paras") return r.role === "paraprofessional";
    return true;
  });
}

export interface AccessRow {
  /** The staff id, so two people with the same name stay two rows. */
  id: string;
  name: string;
  position: string;
  role: string;
}

// Before any real data: saving this list must write an audit row (who saved it, when) and the
// director must acknowledge what it contains. The practice app does neither because nothing here
// is real or leaves the browser.

/** Everyone who may see student records: active staff with building and role name. */
export const accessRoster = (today?: string, people?: readonly StaffPerson[]): AccessRow[] =>
  staffRows(today, people)
    .filter((r) => r.status === "active")
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      role: roleName(r.role),
    }));

/**
 * A CSV the director can save. Every field is quoted, and a field that starts like a spreadsheet
 * formula gets a leading apostrophe so opening it cannot run anything.
 */
export function accessCsv(rows: AccessRow[]): string {
  const field = (text: string): string => {
    const value = text !== "" && "=+-@\t\r".includes(text[0] as string) ? `'${text}` : text;
    return `"${value.replaceAll('"', '""')}"`;
  };
  const lines = rows.map((r) => [field(r.name), field(r.position), field(r.role)].join(","));
  return `${["Name,Position,Role", ...lines].join("\n")}\n`;
}
