// The short IEP sections (practice data only): header dates, meeting attendance, alternate
// assessment and extended school year. Kept in this browser's storage, one record per student.
// Nothing is sent anywhere; the teacher copies each item into SRS by hand.
import { clip } from "./codePoints.ts";

/** SRS position list. To be confirmed against the district's dropdown. */
export const POSITIONS = [
  "Regular education teacher",
  "Special education teacher or provider",
  "School district representative",
  "Individual to interpret evaluation results",
  "Speech language pathologist",
  "Parent",
  "Student",
  "Other",
];

export const PARENT_QUESTIONS = [
  "Parent understood the proceedings",
  "Parent received a copy of the procedural safeguards",
  "Parent was offered their rights",
];

export interface Attendee {
  id: string;
  name: string;
  position: string;
  attended: boolean;
  /** YYYY-MM-DD or empty. */
  date: string;
}
export interface IepShort {
  effective: string;
  meeting: string;
  school: string;
  attendees: Attendee[];
  /** One answer per PARENT_QUESTIONS entry: "yes", "no" or "". */
  parent: string[];
  altRequired: "yes" | "no" | "";
  altWhy: string;
  esy: { choice: "not_needed" | "needed"; text: string } | null;
}
const empty = (): IepShort => ({
  effective: "",
  meeting: "",
  school: "",
  attendees: [],
  parent: PARENT_QUESTIONS.map(() => ""),
  altRequired: "",
  altWhy: "",
  esy: null,
});

// ---- dates (plain parts; no Date objects, so no time zone can shift a day) ----

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) =>
  [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function parseDate(s: string): [number, number, number] | null {
  const m = DATE.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo) ? [y, mo, d] : null;
}
/** The way SRS shows a date. */
export function usDate(s: string): string {
  const p = parseDate(s);
  return p ? `${pad(p[1])}/${pad(p[2])}/${pad(p[0], 4)}` : "";
}
/** The day before the first anniversary. A Feb 29 start has its anniversary on Feb 28. */
export function reviewDate(effective: string): string {
  const p = parseDate(effective);
  if (!p) return "";
  let [y, m, d] = [p[0] + 1, p[1], p[2]];
  d = Math.min(d, daysIn(y, m));
  d--;
  if (d === 0) {
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
    d = daysIn(y, m);
  }
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

// ---- storage ----

export const IEP_SHORT_KEY = "goalline-practice-iepshort-v1";

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
const str = (v: unknown, max: number) => (typeof v === "string" ? clip(v, max) : "");
const day = (v: unknown) => (typeof v === "string" && parseDate(v) ? v : "");

function clean(v: unknown): IepShort {
  const out = empty();
  if (!isRec(v)) return out;
  out.effective = day(v["effective"]);
  out.meeting = day(v["meeting"]);
  out.school = str(v["school"], 120);
  if (Array.isArray(v["attendees"]))
    for (const a of v["attendees"].slice(0, 40)) {
      if (!isRec(a) || typeof a["id"] !== "string") continue;
      out.attendees.push({
        id: a["id"].slice(0, 12),
        name: str(a["name"], 120),
        position: POSITIONS.includes(a["position"] as string) ? (a["position"] as string) : "",
        attended: a["attended"] !== false,
        date: day(a["date"]),
      });
    }
  if (Array.isArray(v["parent"]))
    out.parent = PARENT_QUESTIONS.map((_, i) => {
      const x = (v["parent"] as unknown[])[i];
      return x === "yes" || x === "no" ? x : "";
    });
  out.altRequired = v["altRequired"] === "yes" || v["altRequired"] === "no" ? v["altRequired"] : "";
  out.altWhy = str(v["altWhy"], 2000);
  const e = v["esy"];
  if (isRec(e) && (e["choice"] === "not_needed" || e["choice"] === "needed"))
    out.esy = { choice: e["choice"], text: str(e["text"], 2000) };
  return out;
}

function load(): Map<string, IepShort> {
  const out = new Map<string, IepShort>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(IEP_SHORT_KEY) ?? "{}");
    if (isRec(raw)) for (const [sid, rec] of Object.entries(raw)) out.set(sid, clean(rec));
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getIepShortVersion = () => version;
export function subscribeIepShort(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function save() {
  try {
    storage?.setItem(IEP_SHORT_KEY, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // storage full or blocked: the work still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function useIepShortStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetIepShortForTests() {
  records = new Map();
  save();
}

export const getIepShort = (studentId: string): IepShort => records.get(studentId) ?? empty();

export function updateIepShort(studentId: string, change: (r: IepShort) => IepShort) {
  records.set(studentId, clean(change(getIepShort(studentId))));
  save();
}
export function addAttendee(studentId: string) {
  updateIepShort(studentId, (r) => {
    const next = Math.max(0, ...r.attendees.map((a) => Number(a.id) || 0)) + 1;
    return {
      ...r,
      attendees: [
        ...r.attendees,
        { id: String(next), name: "", position: "", attended: true, date: r.meeting },
      ],
    };
  });
}

// ---- packet items ----
