// Services and supports for one student (practice data only). One row per line of the SRS service
// tables. The teacher types or picks each cell, then copies it into SRS by hand. Nothing is sent.

export type ServiceKind = "special_education" | "related" | "supports_personnel" | "accommodation";
export const SERVICE_KINDS: { id: ServiceKind; label: string }[] = [
  { id: "special_education", label: "Special education service" },
  { id: "related", label: "Related service" },
  { id: "supports_personnel", label: "Supports for school personnel" },
  { id: "accommodation", label: "Accommodation" },
];
export const kindLabel = (k: ServiceKind) => SERVICE_KINDS.find((x) => x.id === k)?.label ?? k;

/** Whether the person named on a service can still log against it. Comes from the server's roster. */
export type ProviderState = "active" | "paused" | "removed" | "role_ended" | "role_changed";

export interface ServiceRow {
  id: string;
  kind: ServiceKind;
  title: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD; may be empty when the service runs to the annual review. */
  end: string;
  /** A count or a condition, such as "22 days/semester" or "On timed work". */
  frequency: string;
  /** Time per occurrence, such as "15 min/day". */
  duration: string;
  /** A named place. */
  location: string;
  followsCalendar: boolean;
  /**
   * Only on rows that come from a server: the provider named on a related service, or null when
   * none is named. Practice and sample rows leave it out, and then no provider note is shown.
   */
  provider?: { state: ProviderState } | null;
}
export type RowDraft = Omit<ServiceRow, "id">;

const VAGUE = /\b(as needed|if needed|when needed|as appropriate|as required|prn|n\/a|tbd)\b/i;
const COUNT = /\d|\b(daily|weekly|monthly|each|every|once|twice|during|on|when|whenever)\b/i;
/**
 * What to tell the team about the provider on a related service: nothing when the row carries no
 * provider data (practice rows), "needs a provider" when none is named, and "needs a new provider"
 * when the named person is paused, removed, their role has ended or they now hold another role. Nothing is cleared for them.
 */
export function providerNote(r: Pick<ServiceRow, "kind" | "provider">): string | null {
  if (r.kind !== "related" || r.provider === undefined) return null;
  if (r.provider === null) return "Needs a provider";
  return r.provider.state === "active" ? null : "Needs a new provider";
}

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a row cannot be pasted yet; undefined when it is complete. */
export function rowProblem(r: RowDraft): string | undefined {
  if (r.title.trim() === "") return "Name the service.";
  if (!DATE.test(r.start)) return "Add a start date.";
  if (r.end !== "" && (!DATE.test(r.end) || r.end < r.start))
    return "The end date is before the start date.";
  const f = r.frequency.trim();
  if (f === "") return "Add how often.";
  if (VAGUE.test(f) || !COUNT.test(f))
    return 'Frequency must be a count or a condition, not "as needed".';
  if (r.duration.trim() === "") return "Add how long.";
  if (r.location.trim() === "") return "Name the place. The team chooses it.";
  return undefined;
}

export interface ServiceRecord {
  studentId: string;
  rows: ServiceRow[];
  nextId: number;
}

export const SERVICES_KEY = "goalline-practice-services-v1";

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

export const PROVIDER_STATES: ProviderState[] = [
  "active",
  "paused",
  "removed",
  "role_ended",
  "role_changed",
];
const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const isRow = (v: unknown): v is ServiceRow =>
  isRec(v) &&
  str(v["id"]) &&
  SERVICE_KINDS.some((k) => k.id === v["kind"]) &&
  str(v["title"]) &&
  str(v["start"]) &&
  str(v["end"]) &&
  str(v["frequency"]) &&
  str(v["duration"]) &&
  str(v["location"]) &&
  typeof v["followsCalendar"] === "boolean" &&
  (v["provider"] === undefined ||
    v["provider"] === null ||
    (isRec(v["provider"]) && PROVIDER_STATES.includes(v["provider"]["state"] as ProviderState)));

function load(): Map<string, ServiceRecord> {
  const out = new Map<string, ServiceRecord>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SERVICES_KEY) ?? "[]");
    if (Array.isArray(raw))
      for (const r of raw)
        if (
          isRec(r) &&
          str(r["studentId"]) &&
          typeof r["nextId"] === "number" &&
          Array.isArray(r["rows"]) &&
          r["rows"].every(isRow)
        )
          out.set(r["studentId"], r as unknown as ServiceRecord);
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getServicesVersion = () => version;
export function subscribeServices(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function commit(next: ServiceRecord) {
  records.set(next.studentId, next);
  try {
    storage?.setItem(SERVICES_KEY, JSON.stringify([...records.values()]));
  } catch {
    // storage full or blocked: the rows still stand for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function useServicesStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetServicesForTests() {
  records = new Map();
  try {
    storage?.setItem(SERVICES_KEY, "[]");
  } catch {
    // ignore
  }
  version++;
  for (const l of listeners) l();
}

export const getServices = (studentId: string): ServiceRecord =>
  records.get(studentId) ?? { studentId, rows: [], nextId: 1 };

export function addServiceRow(studentId: string, draft: RowDraft): ServiceRow {
  const rec = getServices(studentId);
  const row: ServiceRow = { ...draft, id: `sv${rec.nextId}` };
  commit({ ...rec, rows: [...rec.rows, row], nextId: rec.nextId + 1 });
  return row;
}
export function updateServiceRow(studentId: string, id: string, draft: RowDraft) {
  const rec = getServices(studentId);
  commit({ ...rec, rows: rec.rows.map((r) => (r.id === id ? { ...draft, id } : r)) });
}
export function removeServiceRow(studentId: string, id: string) {
  const rec = getServices(studentId);
  commit({ ...rec, rows: rec.rows.filter((r) => r.id !== id) });
}
