import type { AlternativeInput, BoxId, PwnDraft, RowChange } from "./pwn.ts";
import { BOX_LABEL } from "./pwn.ts";
import { clip } from "./codePoints.ts";

// What the teacher types for the Prior Written Notice (practice data only), plus which boxes were
// approved. The draft itself is rebuilt by code from the other IEP sections every time; only the
// teacher's own entries and a fingerprint per approved box are kept. Nothing is sent anywhere.

export interface PwnEntry {
  /** YYYY-MM-DD */
  noteDate: string;
  deliveryDate: string;
  /** The delivery method label, exactly as picked in the record system. */
  deliveryMethod: string;
  reasons: string[];
  alternatives: AlternativeInput[];
  otherFactors: string[];
  contact: { name: string; role: string; phone: string };
  helpSource: string;
  /** service row id or goal id -> what this IEP does to it. Unmarked items count as "added". */
  changes: Record<string, RowChange>;
  /** box id -> fingerprint of the text when the teacher approved it. */
  approved: Partial<Record<BoxId, string>>;
}

export const PWN_KEY = "goalline-practice-pwn-v1";
const MAX_LINES = 20;
const MAX_TEXT = 1000;

export const emptyEntry = (): PwnEntry => ({
  noteDate: "",
  deliveryDate: "",
  deliveryMethod: "",
  reasons: [],
  alternatives: [],
  otherFactors: [],
  contact: { name: "", role: "", phone: "" },
  helpSource: "",
  changes: {},
  approved: {},
});

export const CHANGES: RowChange[] = ["added", "changed", "unchanged", "removed"];

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
const str = (v: unknown) => (typeof v === "string" ? clip(v, MAX_TEXT) : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.slice(0, MAX_LINES).map(str) : []);

/** Keeps only well-formed fields, so a damaged or hand-edited store cannot break the page. */
function clean(v: unknown): PwnEntry {
  const e = emptyEntry();
  if (!isRec(v)) return e;
  e.noteDate = str(v["noteDate"]);
  e.deliveryDate = str(v["deliveryDate"]);
  e.deliveryMethod = str(v["deliveryMethod"]);
  e.reasons = strList(v["reasons"]);
  e.otherFactors = strList(v["otherFactors"]);
  if (Array.isArray(v["alternatives"]))
    for (const a of v["alternatives"].slice(0, MAX_LINES))
      if (isRec(a)) e.alternatives.push({ option: str(a["option"]), reason: str(a["reason"]) });
  e.helpSource = str(v["helpSource"]);
  const c = v["contact"];
  if (isRec(c)) e.contact = { name: str(c["name"]), role: str(c["role"]), phone: str(c["phone"]) };
  const ch = v["changes"];
  if (isRec(ch))
    for (const [id, c] of Object.entries(ch))
      if (CHANGES.includes(c as RowChange)) e.changes[id] = c as RowChange;
  const ap = v["approved"];
  if (isRec(ap))
    for (const id of Object.keys(BOX_LABEL) as BoxId[])
      if (typeof ap[id] === "string") e.approved[id] = ap[id];
  return e;
}

function load(): Map<string, PwnEntry> {
  const out = new Map<string, PwnEntry>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(PWN_KEY) ?? "{}");
    if (isRec(raw)) for (const [sid, e] of Object.entries(raw)) out.set(sid, clean(e));
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getPwnVersion = () => version;
export function subscribePwn(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function save() {
  try {
    storage?.setItem(PWN_KEY, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // storage full or blocked: the work still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function usePwnStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetPwnForTests() {
  records = new Map();
  save();
}

export const getPwnEntry = (studentId: string): PwnEntry => records.get(studentId) ?? emptyEntry();

/** Saves the teacher's entries. Any edit clears every approval, since the text may have changed. */
export function setPwnEntry(studentId: string, patch: Partial<Omit<PwnEntry, "approved">>) {
  const next = clean({ ...getPwnEntry(studentId), ...patch, approved: {} });
  records.set(studentId, next);
  save();
}

/** True when the box is approved for exactly the text it has now. */
export function isApproved(entry: PwnEntry, draft: PwnDraft, id: BoxId): boolean {
  const box = draft.boxes.find((b) => b.id === id);
  return !!box && box.blocked.length === 0 && entry.approved[id] === boxFingerprint(box.text);
}

export function boxFingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Approve one box. Refused while the box is blocked. */
export function approveBox(studentId: string, draft: PwnDraft, id: BoxId): boolean {
  const box = draft.boxes.find((b) => b.id === id);
  if (!box || box.blocked.length > 0 || !box.text) return false;
  const cur = getPwnEntry(studentId);
  records.set(studentId, { ...cur, approved: { ...cur.approved, [id]: boxFingerprint(box.text) } });
  save();
  return true;
}
