import {
  data_points,
  goals as sampleGoals,
  ieps as sampleIeps,
  measurement_plans,
  students as sampleStudents,
  synthetic,
} from "@synthetic/fixtures/demo-district.json";
import type {
  DataPoint,
  Goal,
  GoalArea,
  Iep,
  MeasurementPlan,
  MeasurementType,
  Student,
  SyntheticDistrict,
} from "@synthetic/src/types.ts";

// The practice workspace: made-up students, goals and data. It starts empty. When the browser
// allows it, a copy is kept in this browser's local storage so a reload does not lose it; nothing
// is ever sent anywhere.

export interface Workspace {
  students: Student[];
  ieps: Iep[];
  goals: Goal[];
  plans: MeasurementPlan[];
  points: DataPoint[];
  /** Student ids an SLP or school psych serves. Practice sign-in only. */
  served: string[];
  /** Goal ids a paraprofessional or gen-ed teacher may enter data for. Practice sign-in only. */
  delegated: string[];
}

// Named imports let the bundler drop the parts of the sample file the practice page never shows
// (the tenant and staff records).
const sampleDistrict = {
  synthetic,
  students: sampleStudents,
  ieps: sampleIeps,
  goals: sampleGoals,
  measurement_plans,
  data_points,
} as unknown as Pick<
  SyntheticDistrict,
  "synthetic" | "students" | "ieps" | "goals" | "measurement_plans" | "data_points"
>;
if (sampleDistrict.synthetic !== true)
  throw new Error("Refusing to load a dataset not marked synthetic");

export const emptyWorkspace = (): Workspace => ({
  students: [],
  ieps: [],
  goals: [],
  plans: [],
  points: [],
  served: [],
  delegated: [],
});

/** The sample students, with a few served and delegated so every practice role has something. */
const sampleWorkspace = (): Workspace => {
  const students = sampleDistrict.students;
  const firstGoalOf = (studentId: string) => {
    const iep = sampleDistrict.ieps.find((i) => i.student_id === studentId);
    return sampleDistrict.goals
      .filter((g) => g.iep_id === iep?.id)
      .sort((a, b) => a.sequence - b.sequence)[0]?.id;
  };
  return {
    students,
    ieps: sampleDistrict.ieps,
    goals: sampleDistrict.goals,
    plans: sampleDistrict.measurement_plans,
    points: sampleDistrict.data_points,
    served: students.slice(0, 5).map((s) => s.id),
    delegated: students
      .slice(0, 6)
      .map((s) => firstGoalOf(s.id))
      .filter((g): g is string => g !== undefined),
  };
};

export const STORAGE_KEY = "goalline-practice-v1";
const MAX_STORED_CHARS = 4_000_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** "local" keeps practice data across visits; "session" forgets it when the tab closes. */
const STORAGE_KIND: "local" | "session" = "local";

let storage: StorageLike | null = null;
try {
  storage =
    typeof window === "undefined"
      ? null
      : STORAGE_KIND === "local"
        ? window.localStorage
        : window.sessionStorage;
} catch {
  storage = null;
}

/** Tests inject a fake; the app uses the browser's own storage when it is available. */
export function useStorage(s: StorageLike | null) {
  storage = s;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const GRADES = new Set(["PK", "K", ...Array.from({ length: 12 }, (_, i) => String(i + 1))]);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 20 && v.every((x) => str(x, 200));

const validStudent = (s: Rec) =>
  str(s["id"], 80) &&
  str(s["first_name"], 40) &&
  str(s["last_name"], 40) &&
  (s["preferred_name"] === null || str(s["preferred_name"], 40)) &&
  typeof s["grade"] === "string" &&
  GRADES.has(s["grade"]) &&
  str(s["local_student_id"], 40);
const validIep = (i: Rec) =>
  str(i["id"], 80) &&
  str(i["student_id"], 80) &&
  str(i["effective_from"], 10) &&
  str(i["effective_to"], 10);
const validGoal = (g: Rec) =>
  str(g["id"], 80) &&
  str(g["iep_id"], 80) &&
  str(g["area"], 40) &&
  str(g["statement"], 800) &&
  typeof g["baseline"] === "string" &&
  typeof g["target"] === "string" &&
  typeof g["criteria"] === "string" &&
  num(g["sequence"]);
const validPlan = (p: Rec) =>
  str(p["id"], 80) &&
  str(p["goal_id"], 80) &&
  str(p["type"], 40) &&
  num(p["target_value"]) &&
  (p["unit"] === null || str(p["unit"], 40)) &&
  (p["trials_per_session"] === null || num(p["trials_per_session"])) &&
  strList(p["prompt_hierarchy"]) &&
  strList(p["task_steps"]) &&
  typeof p["frequency"] === "string";
const validPoint = (p: Rec) =>
  str(p["id"], 80) &&
  str(p["goal_id"], 80) &&
  str(p["observed_at"], 40) &&
  num(p["value_num"]) &&
  (p["note"] === null || typeof p["note"] === "string");

const keep = (v: unknown, ok: (r: Rec) => boolean): Rec[] =>
  Array.isArray(v) ? v.filter((r): r is Rec => isRec(r) && ok(r)) : [];

/** Reads stored text back, dropping any record that is malformed or that points at a missing parent. */
export function parse(text: string | null): Workspace | null {
  if (!text || text.length > MAX_STORED_CHARS) return null;
  try {
    const v = JSON.parse(text) as unknown;
    if (!isRec(v) || v["synthetic"] !== true) return null;
    const students = keep(v["students"], validStudent);
    const studentIds = new Set(students.map((s) => s["id"]));
    const ieps = keep(v["ieps"], validIep).filter((i) => studentIds.has(i["student_id"]));
    const iepIds = new Set(ieps.map((i) => i["id"]));
    const goals = keep(v["goals"], validGoal).filter((g) => iepIds.has(g["iep_id"]));
    const goalIds = new Set(goals.map((g) => g["id"]));
    const plans = keep(v["plans"], validPlan).filter((p) => goalIds.has(p["goal_id"]));
    const planGoals = new Set(plans.map((p) => p["goal_id"]));
    const points = keep(v["points"], validPoint).filter((p) => planGoals.has(p["goal_id"]));
    const ids = (list: unknown, allowed: Set<unknown>): string[] =>
      Array.isArray(list)
        ? list.filter((x): x is string => typeof x === "string" && allowed.has(x))
        : [];
    return {
      students,
      ieps,
      goals,
      plans,
      points,
      served: ids(v["served"], studentIds),
      delegated: ids(v["delegated"], goalIds),
    } as unknown as Workspace;
  } catch {
    return null;
  }
}

function load(): Workspace {
  try {
    return parse(storage?.getItem(STORAGE_KEY) ?? null) ?? emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}

let current: Workspace = load();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: Workspace) {
  current = next;
  version++;
  try {
    if (next.students.length === 0) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, JSON.stringify({ synthetic: true, ...next }));
  } catch {
    // Storage full or blocked: the practice data simply lives in memory for this visit.
  }
  for (const l of listeners) l();
}

export const getWorkspace = () => current;
export const getVersion = () => version;
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const id = () => crypto.randomUUID();
const TENANT = "practice";
const day = (d: Date) => d.toISOString().slice(0, 10);

export function addStudent(input: {
  firstName: string;
  lastName: string;
  preferredName?: string;
  grade: string;
}): string {
  const first = input.firstName.trim().slice(0, 40);
  const last = input.lastName.trim().slice(0, 40);
  if (!first || !last) throw new Error("First and last name are required");
  const sid = id();
  const n = current.students.length + 1;
  const now = new Date();
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const student: Student = {
    id: sid,
    tenant_id: TENANT,
    school_id: TENANT,
    first_name: first,
    last_name: last,
    preferred_name: input.preferredName?.trim().slice(0, 40) || null,
    grade: input.grade,
    local_student_id: `PRACTICE-${String(n).padStart(3, "0")}`,
    state_student_id: `PRACTICE-${String(n).padStart(3, "0")}`,
    dob: "2000-01-01",
  };
  const iep: Iep = {
    id: id(),
    tenant_id: TENANT,
    student_id: sid,
    plan_type: "iep",
    form_version: "nde_v2",
    status: "entered_in_srs",
    type: "initial",
    meeting_date: day(now),
    effective_from: day(now),
    effective_to: day(end),
    annual_review_due: day(end),
    reevaluation_due: day(end),
  };
  commit({ ...current, students: [...current.students, student], ieps: [...current.ieps, iep] });
  return sid;
}

export interface GoalInput {
  area: GoalArea;
  statement: string;
  baseline: string;
  criteria: string;
  type: MeasurementType;
  unit: string;
  targetValue: number;
  trialsPerSession: number | null;
  promptHierarchy: string[];
  taskSteps: string[];
  frequency: string;
}

export function addGoal(studentId: string, input: GoalInput): string {
  const iep = current.ieps.find((i) => i.student_id === studentId);
  if (!iep) throw new Error("Student not found");
  const statement = input.statement.trim().slice(0, 800);
  if (!statement) throw new Error("The goal needs wording");
  if (!Number.isFinite(input.targetValue) || input.targetValue <= 0)
    throw new Error("The target must be a number above zero");
  const gid = id();
  const unit = input.unit.trim().slice(0, 40) || null;
  const level = input.promptHierarchy[input.targetValue - 1];
  const goal: Goal = {
    id: gid,
    tenant_id: TENANT,
    iep_id: iep.id,
    area: input.area,
    statement,
    condition: "",
    behavior: "",
    baseline: input.baseline.trim().slice(0, 200),
    target: level ?? `${input.targetValue}${unit ? ` ${unit}` : ""}`,
    criteria: input.criteria.trim().slice(0, 300),
    sequence: current.goals.filter((g) => g.iep_id === iep.id).length,
  };
  const plan: MeasurementPlan = {
    id: id(),
    tenant_id: TENANT,
    goal_id: gid,
    type: input.type,
    unit,
    target_value: input.targetValue,
    trials_per_session: input.trialsPerSession,
    prompt_hierarchy: input.promptHierarchy,
    task_steps: input.taskSteps,
    frequency: input.frequency,
  };
  commit({ ...current, goals: [...current.goals, goal], plans: [...current.plans, plan] });
  return gid;
}

export function addPoint(goalId: string, value: number, note: string) {
  const plan = current.plans.find((p) => p.goal_id === goalId);
  if (!plan) throw new Error("Goal not found");
  const at = new Date().toISOString();
  const point: DataPoint = {
    id: id(),
    tenant_id: TENANT,
    goal_id: goalId,
    plan_id: plan.id,
    observed_at: at,
    value_num: value,
    correct: null,
    total: null,
    prompt_level: null,
    step_results: null,
    setting: "practice",
    note: note.trim().slice(0, 200) || null,
    collector_id: TENANT,
    device_id: "browser",
    client_created_at: at,
  };
  commit({ ...current, points: [...current.points, point] });
}

export function loadSample() {
  commit(sampleWorkspace());
}

export function clearAll() {
  commit(emptyWorkspace());
}

export function updateStudent(
  studentId: string,
  input: { firstName: string; lastName: string; preferredName?: string; grade: string },
) {
  const first = input.firstName.trim().slice(0, 40);
  const last = input.lastName.trim().slice(0, 40);
  if (!first || !last) throw new Error("First and last name are required");
  if (!current.students.some((s) => s.id === studentId)) throw new Error("Student not found");
  commit({
    ...current,
    students: current.students.map((s) =>
      s.id === studentId
        ? {
            ...s,
            first_name: first,
            last_name: last,
            preferred_name: input.preferredName?.trim().slice(0, 40) || null,
            grade: input.grade,
          }
        : s,
    ),
  });
}

/** Removes the student and everything that belongs to them. */
export function deleteStudent(studentId: string) {
  const iepIds = new Set(current.ieps.filter((i) => i.student_id === studentId).map((i) => i.id));
  const goalIds = new Set(current.goals.filter((g) => iepIds.has(g.iep_id)).map((g) => g.id));
  commit({
    students: current.students.filter((s) => s.id !== studentId),
    ieps: current.ieps.filter((i) => !iepIds.has(i.id)),
    goals: current.goals.filter((g) => !goalIds.has(g.id)),
    plans: current.plans.filter((p) => !goalIds.has(p.goal_id)),
    points: current.points.filter((p) => !goalIds.has(p.goal_id)),
    served: current.served.filter((s) => s !== studentId),
    delegated: current.delegated.filter((g) => !goalIds.has(g)),
  });
}

/**
 * Edits the wording and target of a goal. The measurement type, prompt levels and steps stay as
 * they were, because data already recorded depends on them.
 */
export function updateGoal(
  goalId: string,
  input: Pick<GoalInput, "area" | "statement" | "baseline" | "criteria" | "unit" | "frequency"> & {
    targetValue: number;
    trialsPerSession: number | null;
  },
) {
  const plan = current.plans.find((p) => p.goal_id === goalId);
  if (!plan || !current.goals.some((g) => g.id === goalId)) throw new Error("Goal not found");
  const statement = input.statement.trim().slice(0, 800);
  if (!statement) throw new Error("The goal needs wording");
  if (!Number.isFinite(input.targetValue) || input.targetValue <= 0)
    throw new Error("The target must be a number above zero");
  const unit = input.unit.trim().slice(0, 40) || null;
  const level = plan.prompt_hierarchy[input.targetValue - 1];
  commit({
    ...current,
    goals: current.goals.map((g) =>
      g.id === goalId
        ? {
            ...g,
            area: input.area,
            statement,
            baseline: input.baseline.trim().slice(0, 200),
            criteria: input.criteria.trim().slice(0, 300),
            target: level ?? `${input.targetValue}${unit ? ` ${unit}` : ""}`,
          }
        : g,
    ),
    plans: current.plans.map((p) =>
      p.goal_id === goalId
        ? {
            ...p,
            unit,
            target_value: input.targetValue,
            trials_per_session: input.trialsPerSession,
            frequency: input.frequency,
          }
        : p,
    ),
  });
}

/** Removes the goal and its recorded data. */
export function deleteGoal(goalId: string) {
  commit({
    ...current,
    goals: current.goals.filter((g) => g.id !== goalId),
    plans: current.plans.filter((p) => p.goal_id !== goalId),
    points: current.points.filter((p) => p.goal_id !== goalId),
    delegated: current.delegated.filter((g) => g !== goalId),
  });
}

/** The practice data as text for a download. Made-up data only; the same shape is kept in storage. */
export function exportText(): string {
  return JSON.stringify({ synthetic: true, app: "goalline-practice", version: 1, ...current });
}

export interface ImportResult {
  ok: boolean;
  message: string;
}

/**
 * Loads a file produced by exportText. "replace" swaps the whole workspace; "add" keeps what is
 * here and brings in only the students (with their goals and data) whose ids are not already
 * present. Anything malformed is dropped.
 */
export function importText(text: string, mode: "replace" | "add" = "replace"): ImportResult {
  const ws = parse(text);
  if (!ws || ws.students.length === 0)
    return {
      ok: false,
      message: "That file is not a practice-data export, or it has no students.",
    };
  if (mode === "replace") {
    commit(ws);
    const n = ws.students.length;
    return { ok: true, message: `Loaded ${n} student${n === 1 ? "" : "s"}.` };
  }
  const have = new Set(current.students.map((s) => s.id));
  const students = ws.students.filter((s) => !have.has(s.id));
  const keepS = new Set(students.map((s) => s.id));
  const ieps = ws.ieps.filter((i) => keepS.has(i.student_id));
  const keepI = new Set(ieps.map((i) => i.id));
  const goals = ws.goals.filter((g) => keepI.has(g.iep_id));
  const keepG = new Set(goals.map((g) => g.id));
  if (students.length > 0)
    commit({
      students: [...current.students, ...students],
      ieps: [...current.ieps, ...ieps],
      goals: [...current.goals, ...goals],
      plans: [...current.plans, ...ws.plans.filter((p) => keepG.has(p.goal_id))],
      points: [...current.points, ...ws.points.filter((p) => keepG.has(p.goal_id))],
      served: [...current.served, ...ws.served.filter((x) => keepS.has(x))],
      delegated: [...current.delegated, ...ws.delegated.filter((x) => keepG.has(x))],
    });
  const skipped = ws.students.length - students.length;
  return {
    ok: true,
    message: `Added ${students.length} student${students.length === 1 ? "" : "s"}${
      skipped > 0 ? `; ${skipped} already here and left as they are` : ""
    }.`,
  };
}

export function deletePoint(pointId: string) {
  commit({ ...current, points: current.points.filter((p) => p.id !== pointId) });
}

const toggle = (list: string[], id: string, on: boolean) =>
  on ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id);

/** Practice sign-in: an SLP or school psych serves this student. */
export function setServed(studentId: string, on: boolean) {
  if (!current.students.some((s) => s.id === studentId)) throw new Error("Student not found");
  commit({ ...current, served: toggle(current.served, studentId, on) });
}

/** Practice sign-in: a paraprofessional or gen-ed teacher may enter data for this goal. */
export function setDelegated(goalId: string, on: boolean) {
  if (!current.goals.some((g) => g.id === goalId)) throw new Error("Goal not found");
  commit({ ...current, delegated: toggle(current.delegated, goalId, on) });
}
