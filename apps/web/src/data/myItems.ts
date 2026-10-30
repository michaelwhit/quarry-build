import { useSyncExternalStore } from "react";
import type { MeasurementType } from "@synthetic/src/types.ts";
import { clip, within } from "./codePoints.ts";
import { GRADE_BANDS, type GoalItem, goalAreaLabel } from "./library.ts";

// A teacher's own saved goal wording ("My items"), kept in this browser only. Practice data:
// nothing is sent anywhere. Each item is a library goal with the student's name taken out, so it
// can be filled in for any student the same way a starter goal is.

export const MY_ITEMS_KEY = "goalline-practice-my-items-v1";
export const MAX_MY_GOALS = 50;
const MAX_TEXT = 900;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let storage: StorageLike | null = null;
try {
  storage = typeof window === "undefined" ? null : window.localStorage;
} catch {
  storage = null;
}

const TYPES: MeasurementType[] = [
  "percent_correct",
  "trials",
  "frequency",
  "rate",
  "duration",
  "latency",
  "rubric",
  "prompt_level",
  "task_analysis",
  "yes_no",
];
const SLOT_KINDS = ["text", "number", "choice", "date"];

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = MAX_TEXT): v is string => typeof v === "string" && within(v, max);
const strs = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 60 && v.every((x) => str(x, 300));
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** True when the value is a goal item this screen can show and fill in. */
export function isMyGoal(v: unknown): v is GoalItem {
  if (!isRec(v)) return false;
  const m = v["mastery"];
  return (
    str(v["id"], 60) &&
    v["id"].startsWith("my-") &&
    str(v["title"], 120) &&
    str(v["template_text"]) &&
    str(v["condition_text"]) &&
    str(v["behavior_text"]) &&
    str(v["method"], 60) &&
    str(v["unit"], 60) &&
    str(v["baseline_guidance"]) &&
    typeof v["area"] === "string" &&
    Object.hasOwn(goalAreaLabel, v["area"]) &&
    typeof v["type"] === "string" &&
    TYPES.includes(v["type"] as MeasurementType) &&
    Array.isArray(v["grade_bands"]) &&
    v["grade_bands"].length <= GRADE_BANDS.length &&
    v["grade_bands"].every((b) => GRADE_BANDS.some((g) => g === b)) &&
    Array.isArray(v["slots"]) &&
    v["slots"].length <= 10 &&
    v["slots"].every(
      (s) => isRec(s) && str(s["name"], 40) && SLOT_KINDS.includes(s["kind"] as string),
    ) &&
    isRec(m) &&
    str(m["unit"], 60) &&
    num(m["window_count"]) &&
    num(m["window_of"]) &&
    (m["threshold"] === null || m["threshold"] === undefined || num(m["threshold"])) &&
    (m["comparator"] === ">=" || m["comparator"] === "<=") &&
    (m["window_kind"] === "consecutive" || m["window_kind"] === "best_of") &&
    typeof m["maintenance_check"] === "boolean" &&
    num(v["target_value"]) &&
    (v["trials_per_session"] === null || num(v["trials_per_session"])) &&
    strs(v["prompt_hierarchy"]) &&
    strs(v["task_steps"]) &&
    strs(v["objective_ladder"]) &&
    strs(v["related_accommodation_ids"])
  );
}

function load(): GoalItem[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(MY_ITEMS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw
      .filter(isMyGoal)
      .filter((g) => !seen.has(g.id) && seen.add(g.id))
      .slice(0, MAX_MY_GOALS);
  } catch {
    return [];
  }
}

let items = load();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: GoalItem[]): boolean {
  items = next;
  let kept = true;
  try {
    if (!storage) kept = false;
    else storage.setItem(MY_ITEMS_KEY, JSON.stringify(next));
  } catch {
    kept = false;
  }
  version++;
  for (const l of listeners) l();
  return kept;
}

export const subscribeMyItems = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getMyItemsVersion = () => version;
export const getMyGoals = (): GoalItem[] => items;

/** The saved goals, redrawing when they change. */
export function useMyGoals(): GoalItem[] {
  useSyncExternalStore(subscribeMyItems, getMyItemsVersion, getMyItemsVersion);
  return items;
}

let counter = 0;
const newId = () => `my-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export type SaveResult =
  { ok: true; id: string; kept: boolean } | { ok: false; reason: "full" | "duplicate" | "invalid" };

/** Adds a goal to My items. `kept` is false when the browser would not save it for later visits. */
export function addMyGoal(item: Omit<GoalItem, "id">): SaveResult {
  if (items.length >= MAX_MY_GOALS) return { ok: false, reason: "full" };
  if (items.some((g) => g.template_text === item.template_text))
    return { ok: false, reason: "duplicate" };
  const id = newId();
  // The same test a saved item must pass on the next visit, so nothing is accepted and then lost.
  if (!isMyGoal({ ...item, id })) return { ok: false, reason: "invalid" };
  const kept = commit([...items, { ...item, id }]);
  return { ok: true, id, kept };
}

/** Renames a saved goal. False when the name is blank or too long, or the goal is gone. */
export function renameMyGoal(id: string, title: string): boolean {
  const name = title.trim();
  if (!name || !within(name, 120) || !items.some((g) => g.id === id)) return false;
  commit(items.map((g) => (g.id === id ? { ...g, title: name } : g)));
  return true;
}

/** Saves a copy of a goal under "<title> (copy)", for changing the wording without losing the first. */
export function duplicateMyGoal(id: string): SaveResult {
  const from = items.find((g) => g.id === id);
  if (!from) return { ok: false, reason: "invalid" };
  if (items.length >= MAX_MY_GOALS) return { ok: false, reason: "full" };
  const copy = { ...from, id: newId(), title: clip(`${from.title} (copy)`, 120) };
  if (!isMyGoal(copy)) return { ok: false, reason: "invalid" };
  const kept = commit([...items, copy]);
  return { ok: true, id: copy.id, kept };
}

export function removeMyGoal(id: string) {
  commit(items.filter((g) => g.id !== id));
}

/** Removes everything (the Clear practice data button). */
export function clearMyGoals() {
  commit([]);
}

/** For tests: use another store, or none, and read what it holds. */
export function setMyItemsStorageForTests(s: StorageLike | null) {
  storage = s;
  items = load();
  version++;
  for (const l of listeners) l();
}
export const resetMyItemsForTests = () => commit([]);
