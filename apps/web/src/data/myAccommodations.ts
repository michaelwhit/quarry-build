import { useSyncExternalStore } from "react";
import { clip, within } from "./codePoints.ts";
import type { AccommodationItem } from "./library.ts";

// A teacher's own saved accommodation wording ("My items" on the Accommodations tab), kept in this
// browser only. Practice data: nothing is sent anywhere. Each item is a library accommodation with
// the teacher's own location, frequency and duration, so it can be added to any student.

export const MY_ACCOMMODATIONS_KEY = "goalline-practice-my-accommodations-v1";
export const MAX_MY_ACCOMMODATIONS = 50;
export const MY_ACCOMMODATION_PREFIX = "mya-";

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

const KINDS = ["accommodation", "supplementary_aid", "testing_accommodation"];
const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim() !== "" && within(v, max);

export const isMyAccommodationId = (id: string) => id.startsWith(MY_ACCOMMODATION_PREFIX);

/** True when the value is an accommodation item this screen can show and add to a student. */
export function isMyAccommodation(v: unknown): v is AccommodationItem {
  return (
    isRec(v) &&
    str(v["id"], 60) &&
    v["id"].startsWith(MY_ACCOMMODATION_PREFIX) &&
    str(v["title"], 120) &&
    typeof v["kind"] === "string" &&
    KINDS.includes(v["kind"]) &&
    str(v["category"], 60) &&
    str(v["description"], 1000) &&
    str(v["location"], 200) &&
    str(v["frequency"], 200) &&
    str(v["duration"], 200)
  );
}

function load(): AccommodationItem[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(MY_ACCOMMODATIONS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw
      .filter(isMyAccommodation)
      .filter((a) => !seen.has(a.id) && seen.add(a.id))
      .slice(0, MAX_MY_ACCOMMODATIONS);
  } catch {
    return [];
  }
}

let items = load();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: AccommodationItem[]): boolean {
  items = next;
  let kept = true;
  try {
    if (!storage) kept = false;
    else storage.setItem(MY_ACCOMMODATIONS_KEY, JSON.stringify(next));
  } catch {
    kept = false;
  }
  version++;
  for (const l of listeners) l();
  return kept;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;
export const getMyAccommodations = (): AccommodationItem[] => items;

/** The saved accommodations, redrawing when they change. */
export function useMyAccommodations(): AccommodationItem[] {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return items;
}

const COPY_SUFFIX = " (copy)";
let counter = 0;
const newId = () =>
  `${MY_ACCOMMODATION_PREFIX}${Date.now().toString(36)}-${(counter++).toString(36)}`;
const same = (a: Omit<AccommodationItem, "id">, b: AccommodationItem) =>
  a.title === b.title &&
  a.description === b.description &&
  a.location === b.location &&
  a.frequency === b.frequency &&
  a.duration === b.duration;

export type SaveResult =
  { ok: true; id: string; kept: boolean } | { ok: false; reason: "full" | "duplicate" | "invalid" };

/** Adds an accommodation to My items. `kept` is false when the browser would not save it. */
export function addMyAccommodation(item: Omit<AccommodationItem, "id">): SaveResult {
  if (items.length >= MAX_MY_ACCOMMODATIONS) return { ok: false, reason: "full" };
  const clean = {
    ...item,
    title: item.title.trim(),
    location: item.location.trim(),
    frequency: item.frequency.trim(),
    duration: item.duration.trim(),
  };
  if (items.some((a) => same(clean, a))) return { ok: false, reason: "duplicate" };
  const id = newId();
  // The same test a saved item must pass on the next visit, so nothing is accepted and then lost.
  if (!isMyAccommodation({ ...clean, id })) return { ok: false, reason: "invalid" };
  const kept = commit([...items, { ...clean, id }]);
  return { ok: true, id, kept };
}

/** Renames a saved accommodation. False when the name is blank or too long, or it is gone. */
export function renameMyAccommodation(id: string, title: string): boolean {
  const name = title.trim();
  if (!name || !within(name, 120) || !items.some((a) => a.id === id)) return false;
  commit(items.map((a) => (a.id === id ? { ...a, title: name } : a)));
  return true;
}

/** Saves a copy under "<title> (copy)", for changing the wording without losing the first. */
export function duplicateMyAccommodation(id: string): SaveResult {
  const from = items.find((a) => a.id === id);
  if (!from) return { ok: false, reason: "invalid" };
  if (items.length >= MAX_MY_ACCOMMODATIONS) return { ok: false, reason: "full" };
  const copy = {
    ...from,
    id: newId(),
    title: `${clip(from.title, 120 - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
  };
  if (!isMyAccommodation(copy)) return { ok: false, reason: "invalid" };
  const kept = commit([...items, copy]);
  return { ok: true, id: copy.id, kept };
}

export function removeMyAccommodation(id: string) {
  commit(items.filter((a) => a.id !== id));
}

/** For tests: use another store, or none, and read what it holds. */
export function setMyAccommodationsStorageForTests(s: StorageLike | null) {
  storage = s;
  items = load();
  version++;
  for (const l of listeners) l();
}
export const resetMyAccommodationsForTests = () => commit([]);
