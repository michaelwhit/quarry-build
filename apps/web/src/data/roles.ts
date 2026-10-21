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
    sees: "The students on their caseload with full goals. Can add and edit, give a para data entry on a goal, and share a goal read-only with a gen-ed teacher.",
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
    sees: "Only the goals shared with them, as a read-only At a glance. No data entry and no editing.",
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
  | "manageData"
  | "evaluation"
  | "staffRoles";

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
    "evaluation",
    "staffRoles",
  ],
  case_manager: [
    "addStudent",
    "editStudent",
    "deleteStudent",
    "editGoal",
    "share",
    "history",
    "evaluation",
  ],
  related_service_provider: ["editGoal", "history"],
  paraprofessional: [],
  gen_ed_teacher: [],
};

export const can = (role: RoleId | null, action: Action): boolean =>
  role !== null && ALLOWED[role].includes(action);

/** Where a para or gen-ed teacher lands when the address is not one of theirs: gen-ed teachers have no session screen, so they start on My students. */
export const delegateFallback = (role: RoleId | null): "my_students" | "today" =>
  role === "gen_ed_teacher" ? "my_students" : "today";

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
let signOutHook: (() => void) | null = null;
/** The private sign-in build registers here to end its server session; the practice build never does. */
export function onSignOut(h: (() => void) | null) {
  signOutHook = h;
}
export function setRole(next: RoleId | null) {
  if (next === null && current !== null) signOutHook?.();
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
