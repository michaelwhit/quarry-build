import { type LogEntry, OUTCOMES, addEntry, entryProblem, removeEntry } from "./serviceLog.ts";

// The service minutes log a person keeps for one student (practice data only): the minutes the IEP
// calls for each week and the entries made so far. Kept in this browser's storage, one record per
// student. Nothing is sent anywhere.

export interface StudentLog {
  /** Minutes the IEP calls for each week; 0 until the person types it. */
  requiredPerWeek: number;
  entries: LogEntry[];
}
const empty = (): StudentLog => ({ requiredPerWeek: 0, entries: [] });

export const SERVICE_LOG_KEY = "goalline-practice-servicelog-v1";
export const MAX_ENTRIES = 400;
export const MAX_REQUIRED = 2400;

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

function clean(v: unknown): StudentLog {
  const out = empty();
  if (!isRec(v)) return out;
  const req = v["requiredPerWeek"];
  if (typeof req === "number" && Number.isInteger(req) && req >= 0 && req <= MAX_REQUIRED)
    out.requiredPerWeek = req;
  if (Array.isArray(v["entries"]))
    for (const e of v["entries"].slice(0, MAX_ENTRIES)) {
      if (!isRec(e)) continue;
      const entry: LogEntry = {
        id: typeof e["id"] === "string" ? e["id"].slice(0, 40) : "",
        date: typeof e["date"] === "string" ? e["date"] : "",
        minutes: typeof e["minutes"] === "number" ? e["minutes"] : 0,
        outcome: OUTCOMES.find((o) => o === e["outcome"]) ?? ("" as LogEntry["outcome"]),
      };
      out.entries = addEntry(out.entries, entry);
    }
  return out;
}

function load(): Map<string, StudentLog> {
  const out = new Map<string, StudentLog>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SERVICE_LOG_KEY) ?? "{}");
    if (isRec(raw)) for (const [sid, rec] of Object.entries(raw)) out.set(sid, clean(rec));
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getServiceLogVersion = () => version;
export function subscribeServiceLog(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function save() {
  try {
    storage?.setItem(SERVICE_LOG_KEY, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // storage full or blocked: the work still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function useServiceLogStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetServiceLogForTests() {
  records = new Map();
  save();
}

export const getServiceLog = (studentId: string): StudentLog => records.get(studentId) ?? empty();

export function setRequiredPerWeek(studentId: string, minutes: number) {
  const log = getServiceLog(studentId);
  // A value that is not a whole number in range leaves the saved one alone, rather than zeroing it.
  const n =
    Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_REQUIRED
      ? minutes
      : log.requiredPerWeek;
  records.set(studentId, { ...log, requiredPerWeek: n });
  save();
}

/** Adds an entry; returns the problem in plain words, or null when it was added. */
export function logEntry(studentId: string, e: Omit<LogEntry, "id">): string | null {
  const log = getServiceLog(studentId);
  const next = {
    ...e,
    id: `e${Math.max(0, ...log.entries.map((x) => Number(x.id.slice(1)) || 0)) + 1}`,
  };
  const problem = entryProblem(next);
  if (problem) return problem;
  if (log.entries.length >= MAX_ENTRIES) return `A log holds at most ${MAX_ENTRIES} entries.`;
  records.set(studentId, { ...log, entries: addEntry(log.entries, next) });
  save();
  return null;
}

export function deleteEntry(studentId: string, id: string) {
  const log = getServiceLog(studentId);
  records.set(studentId, { ...log, entries: removeEntry(log.entries, id) });
  save();
}
