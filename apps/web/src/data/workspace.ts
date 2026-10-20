import raw from "@synthetic/fixtures/demo-district.json";
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
}

export const sampleDistrict = raw as unknown as SyntheticDistrict;
if (sampleDistrict.synthetic !== true)
  throw new Error("Refusing to load a dataset not marked synthetic");

export const emptyWorkspace = (): Workspace => ({
  students: [],
  ieps: [],
  goals: [],
  plans: [],
  points: [],
});

const sampleWorkspace = (): Workspace => ({
  students: sampleDistrict.students,
  ieps: sampleDistrict.ieps,
  goals: sampleDistrict.goals,
  plans: sampleDistrict.measurement_plans,
  points: sampleDistrict.data_points,
});

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
    return { students, ieps, goals, plans, points } as unknown as Workspace;
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

export interface StudentInput {
  firstName: string;
  lastName: string;
  preferredName?: string;
  grade: string;
}

function buildStudent(input: StudentInput, n: number, now: Date): { student: Student; iep: Iep } {
  const first = input.firstName.trim().slice(0, 40);
  const last = input.lastName.trim().slice(0, 40);
  if (!first || !last) throw new Error("First and last name are required");
  const sid = id();
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
  return { student, iep };
}

export function addStudent(input: StudentInput): string {
  const { student, iep } = buildStudent(input, current.students.length + 1, new Date());
  commit({ ...current, students: [...current.students, student], ieps: [...current.ieps, iep] });
  return student.id;
}

/** Adds several students with one save. If any entry is refused, none is added. */
export function addStudents(inputs: StudentInput[]): string[] {
  const now = new Date();
  const built = inputs.map((input, i) => {
    try {
      return buildStudent(input, current.students.length + i + 1, now);
    } catch (err) {
      throw new Error(
        `Entry ${i + 1}: ${err instanceof Error ? err.message : "could not be added"}`,
        { cause: err },
      );
    }
  });
  commit({
    ...current,
    students: [...current.students, ...built.map((b) => b.student)],
    ieps: [...current.ieps, ...built.map((b) => b.iep)],
  });
  return built.map((b) => b.student.id);
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

/** Replaces the workspace with a file produced by exportText. Anything malformed is dropped. */
export function importText(text: string): ImportResult {
  const ws = parse(text);
  if (!ws || ws.students.length === 0)
    return {
      ok: false,
      message: "That file is not a practice-data export, or it has no students.",
    };
  commit(ws);
  const n = ws.students.length;
  return { ok: true, message: `Loaded ${n} student${n === 1 ? "" : "s"}.` };
}

export function deletePoint(pointId: string) {
  commit({ ...current, points: current.points.filter((p) => p.id !== pointId) });
}
