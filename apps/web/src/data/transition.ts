// The transition plan for a student who is 14 or older (practice data only): postsecondary goals,
// the transition assessments behind them, the services and the course of study, with a plain check
// for pieces still missing. Kept in this browser's storage next to the other practice drafts;
// nothing is sent anywhere. A missing piece describes the draft, never the student.
import { clip } from "./codePoints.ts";

/** Transition planning starts with the IEP in effect when the student turns this age. */
export const MIN_AGE = 14;

export const GOAL_AREAS = [
  { id: "education", label: "Education or training after high school", required: true },
  { id: "employment", label: "Employment", required: true },
  { id: "independent", label: "Independent living (when appropriate)", required: false },
] as const;
export type GoalAreaId = (typeof GOAL_AREAS)[number]["id"];

export interface Assessment {
  id: string;
  /** What was used, such as "Student interest survey". */
  name: string;
  /** ISO date or empty. */
  date: string;
}

export interface TransitionPlan {
  goals: Partial<Record<GoalAreaId, string>>;
  assessments: Assessment[];
  services: string;
  courseOfStudy: string;
}

export const emptyPlan = (): TransitionPlan => ({
  goals: {},
  assessments: [],
  services: "",
  courseOfStudy: "",
});

export const MAX_TEXT = 2000;
export const MAX_ASSESSMENTS = 20;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (iso: string): boolean => {
  if (!ISO.test(iso)) return false;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
};

/** Whole years between two ISO dates, or null when either is not a real date. */
export function ageOn(dob: string, onDate: string): number | null {
  if (!realDate(dob) || !realDate(onDate)) return null;
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = onDate.split("-").map(Number) as [number, number, number];
  const age = oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0);
  return age < 0 ? null : age;
}

/** True when the student is old enough that the plan applies. An unreadable date says no. */
export function needsTransition(dob: string, onDate: string): boolean {
  const age = ageOn(dob, onDate);
  return age !== null && age >= MIN_AGE;
}

/** What is still missing from the draft, in plain words, in the order the screen shows them. */
export function missingPieces(plan: TransitionPlan): string[] {
  const out: string[] = [];
  for (const a of GOAL_AREAS)
    if (a.required && !(plan.goals[a.id] ?? "").trim())
      out.push(`A goal for ${a.label.toLowerCase()}.`);
  if (!plan.assessments.some((a) => a.name.trim())) out.push("At least one transition assessment.");
  if (!plan.services.trim()) out.push("Transition services and activities.");
  if (!plan.courseOfStudy.trim()) out.push("A course of study.");
  return out;
}

export const isComplete = (plan: TransitionPlan): boolean => missingPieces(plan).length === 0;

export const TRANSITION_KEY = "goalline-practice-transition-v1";

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
const text = (v: unknown): string => (typeof v === "string" ? v.slice(0, MAX_TEXT) : "");

/** Keeps only well-formed parts of a stored plan. */
function clean(v: unknown): TransitionPlan {
  const plan = emptyPlan();
  if (!isRec(v)) return plan;
  if (isRec(v["goals"]))
    for (const a of GOAL_AREAS) {
      const t = text(v["goals"][a.id]);
      if (t) plan.goals[a.id] = t;
    }
  if (Array.isArray(v["assessments"]))
    for (const x of v["assessments"].slice(0, MAX_ASSESSMENTS)) {
      if (!isRec(x) || typeof x["id"] !== "string" || !x["id"]) continue;
      const date = text(x["date"]);
      plan.assessments.push({
        id: x["id"],
        name: clip(text(x["name"]), 200),
        date: realDate(date) ? date : "",
      });
    }
  plan.services = text(v["services"]);
  plan.courseOfStudy = text(v["courseOfStudy"]);
  return plan;
}

function load(): Map<string, TransitionPlan> {
  const out = new Map<string, TransitionPlan>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(TRANSITION_KEY) ?? "{}");
    if (isRec(raw)) for (const [sid, p] of Object.entries(raw)) out.set(sid, clean(p));
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getTransitionVersion = () => version;
export function subscribeTransition(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function save() {
  try {
    storage?.setItem(TRANSITION_KEY, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // storage full or blocked: the work still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function useTransitionStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetTransitionForTests() {
  records = new Map();
  save();
}

export const getTransition = (studentId: string): TransitionPlan =>
  records.get(studentId) ?? emptyPlan();

/** Saves the plan after trimming it to the same limits as stored data. */
export function setTransition(studentId: string, plan: TransitionPlan) {
  records.set(studentId, clean(plan));
  save();
}

export function clearTransition(studentId: string) {
  records.delete(studentId);
  save();
}
