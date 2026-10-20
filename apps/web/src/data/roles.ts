// Practice sign-in: pick a made-up staff role to see what that role would see. There are no
// accounts, passwords or network calls, and the choice is kept in memory only: a reload returns to
// the picker. The rules follow the product's staff-role design but this is a demonstration, not
// access control: all practice data is in the same browser.

export type RoleId =
  | "sped_director"
  | "case_manager"
  | "related_service_provider"
  | "paraprofessional"
  | "gen_ed_teacher";

export interface Role {
  id: RoleId;
  label: string;
  /** A made-up person to show as signed in. */
  person: string;
  sees: string;
}

export const ROLES: Role[] = [
  {
    id: "sped_director",
    label: "SPED director",
    person: "Practice Director",
    sees: "All students and every action: add, edit, delete, assign SLP or psych, share data entry, save and load files.",
  },
  {
    id: "case_manager",
    label: "Case manager",
    person: "Practice Case Manager",
    sees: "The students on their caseload with full goals. Can add and edit, and share data entry for a goal with paras and gen-ed teachers.",
  },
  {
    id: "related_service_provider",
    label: "Related-service provider",
    person: "Practice SLP",
    sees: 'Only the students marked as served by SLP or psych ("My students"). Can record data and edit goals for them.',
  },
  {
    id: "paraprofessional",
    label: "Paraprofessional",
    person: "Practice Para",
    sees: "Only goals shared with paras (tabs: Today and More). First name and goal only. Data entry only: no editing, history, files or other students.",
  },
  {
    id: "gen_ed_teacher",
    label: "General-education teacher",
    person: "Practice Teacher",
    sees: "Only goals shared with them. First name and the goal only. Data entry only.",
  },
];

export type Action =
  | "addStudent"
  | "editStudent"
  | "deleteStudent"
  | "editGoal"
  | "share"
  | "assignServed"
  | "history"
  | "files"
  | "manageData";

const ALLOWED: Record<RoleId, readonly Action[]> = {
  sped_director: [
    "addStudent",
    "editStudent",
    "deleteStudent",
    "editGoal",
    "share",
    "assignServed",
    "history",
    "files",
    "manageData",
  ],
  case_manager: ["addStudent", "editStudent", "deleteStudent", "editGoal", "share", "history"],
  related_service_provider: ["editGoal", "history"],
  paraprofessional: [],
  gen_ed_teacher: [],
};

export const can = (role: RoleId | null, action: Action): boolean =>
  role !== null && ALLOWED[role].includes(action);

/** Paras and gen-ed teachers see only the goals shared with them, with fewer student details. */
export const isDelegateRole = (role: RoleId | null): boolean =>
  role === "paraprofessional" || role === "gen_ed_teacher";

export const roleById = (id: RoleId | null): Role | undefined => ROLES.find((r) => r.id === id);

let current: RoleId | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const getRole = () => current;
export const getRoleVersion = () => version;
export function subscribeRole(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function setRole(next: RoleId | null) {
  current = next;
  version++;
  for (const l of listeners) l();
}

/** Paras and gen-ed teachers confirm the student-privacy page once per visit before seeing goals. */
const agreed = new Set<RoleId>();
export const needsPrivacy = (role: RoleId | null): boolean =>
  role !== null && isDelegateRole(role) && !agreed.has(role);
export function agreeToPrivacy(role: RoleId) {
  agreed.add(role);
  version++;
  for (const l of listeners) l();
}
