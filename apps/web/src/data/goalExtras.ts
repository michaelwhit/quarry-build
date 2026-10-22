// The per-goal progress-report boxes of the IEP (practice data only): short-term objectives, how
// often progress is reported, who is responsible, instruments and how parents are told. Kept in
// this browser's storage, keyed by goal id. Nothing is sent anywhere.

/** SRS schedule choices. To be confirmed against the district's coded dropdown. */
export const SCHEDULES = ["Every 4.5 weeks", "Every 9 weeks", "Each semester", "Annually"] as const;

/** How progress reaches parents. To be confirmed against the district's short list. */
export const PARENT_REPORTS = [
  "Progress report sent home",
  "Progress report with the report card",
  "Discussed at a parent conference",
  "Sent by email",
] as const;

export interface GoalExtras {
  objectives: string[];
  /** One of SCHEDULES or empty. */
  schedule: string;
  instruments: string;
  responsible: string;
  /** One of PARENT_REPORTS or empty. */
  parentReport: string;
}
const empty = (): GoalExtras => ({
  objectives: [],
  schedule: "",
  instruments: "",
  responsible: "",
  parentReport: "",
});

export const MAX_OBJECTIVES = 8;
export const GOAL_EXTRAS_KEY = "goalline-practice-goalextras-v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
let storage: StorageLike | null = null;
try {
  storage = typeof window === "undefined" ? null : window.localStorage;
} catch {
  storage = null;
}

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const oneOf = (v: unknown, list: readonly string[]) =>
  typeof v === "string" && list.includes(v) ? v : "";

function clean(v: unknown): GoalExtras {
  const out = empty();
  if (!isRec(v)) return out;
  if (Array.isArray(v["objectives"]))
    out.objectives = v["objectives"].slice(0, MAX_OBJECTIVES).map((o) => str(o, 1000));
  out.schedule = oneOf(v["schedule"], SCHEDULES);
  out.instruments = str(v["instruments"], 500);
  out.responsible = str(v["responsible"], 200);
  out.parentReport = oneOf(v["parentReport"], PARENT_REPORTS);
  return out;
}

function load(): Map<string, GoalExtras> {
  const out = new Map<string, GoalExtras>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(GOAL_EXTRAS_KEY) ?? "{}");
    if (isRec(raw)) for (const [id, rec] of Object.entries(raw)) out.set(id, clean(rec));
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getGoalExtrasVersion = () => version;
export function subscribeGoalExtras(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function save() {
  try {
    storage?.setItem(GOAL_EXTRAS_KEY, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // storage full or blocked: the work still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function useGoalExtrasStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetGoalExtrasForTests() {
  records = new Map();
  save();
}

export const getGoalExtras = (goalId: string): GoalExtras => records.get(goalId) ?? empty();

export function updateGoalExtras(goalId: string, change: (r: GoalExtras) => GoalExtras) {
  records.set(goalId, clean(change(getGoalExtras(goalId))));
  save();
}
