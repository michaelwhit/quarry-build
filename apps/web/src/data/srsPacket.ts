import { scrub, studentById } from "./district.ts";
import { SLOTS, getPl } from "./presentLevels.ts";

// "IEP for SRS" (practice data only). The teacher drafts the IEP here, then copies each section
// into SRS by hand. Nothing is sent anywhere. The checklist keeps who marked a section pasted and
// when, plus a fingerprint of the text; it never keeps the copied text itself.

export interface PacketItem {
  id: string;
  /** The SRS field name on the Copy button. */
  label: string;
  /** Free text to paste. Absent when there is nothing to paste yet. */
  text?: string;
  /** A dropdown or checkbox in SRS: the exact label to pick, never pasted. */
  pick?: string;
  /** Why the item cannot be pasted yet. */
  blocked?: string;
}

export interface PacketSection {
  id: string;
  title: string;
  /** The NDE model IEP reference. */
  nde: string;
  /** Where the content is written in GoalLine; absent when it is not built yet. */
  built: boolean;
  items: PacketItem[];
}

/** One place for the SRS order. A SPED director checks it against the SRS screens; a fix is a move in this list. */
export const SECTION_ORDER: { id: string; title: string; nde: string }[] = [
  { id: "student", title: "Student information and IEP type", nde: "007.03, C2" },
  { id: "team", title: "IEP team and excusals", nde: "007.03" },
  { id: "factors", title: "Special factors", nde: "007.07C" },
  { id: "plaafp", title: "Present levels", nde: "007.07A1, B" },
  { id: "transition", title: "Transition (age 14 and up)", nde: "Version 2" },
  { id: "goals", title: "Annual goals", nde: "007.07A2 to A4" },
  { id: "assessment", title: "Assessment participation", nde: "007.07A7" },
  { id: "services", title: "Services", nde: "007.07A5" },
  { id: "accommodations", title: "Accommodations and supplementary aids", nde: "007.07A8" },
  { id: "esy", title: "Extended school year", nde: "007.07C5b" },
  { id: "placement", title: "Placement considerations", nde: "007.07" },
];

/** Small checksum for "did the text change since it was copied". Not security. */
export function fingerprint(parts: string[]): string {
  const text = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

type Builder = (studentId: string) => PacketItem[];

const plaafp: Builder = (studentId) => {
  const rec = getPl(studentId);
  const s = studentById(studentId)?.student;
  return SLOTS.map((def) => {
    const slot = rec.slots[def.key];
    if (!slot || slot.text.trim() === "")
      return { id: def.key, label: def.label, blocked: "Nothing written yet." };
    if (!slot.approved)
      return { id: def.key, label: def.label, blocked: "Approve this in Present levels first." };
    return { id: def.key, label: def.label, text: s ? scrub(slot.text, s) : slot.text };
  });
};

const goals: Builder = (studentId) => {
  const view = studentById(studentId);
  if (!view) return [];
  return view.goals.flatMap(({ goal, plan }, i) => {
    const n = i + 1;
    const unit = plan.unit ?? plan.type.replaceAll("_", " ");
    return [
      {
        id: `${goal.id}.statement`,
        label: `Goal ${n}: annual goal`,
        text: scrub(goal.statement, view.student),
      },
      ...(goal.baseline.trim()
        ? [
            {
              id: `${goal.id}.baseline`,
              label: `Goal ${n}: baseline`,
              text: scrub(goal.baseline, view.student),
            },
          ]
        : []),
      {
        id: `${goal.id}.measure`,
        label: `Goal ${n}: how progress is measured`,
        text: `Target ${plan.target_value} ${unit}, recorded ${plan.frequency}.`,
      },
    ];
  });
};

const BUILDERS: Record<string, Builder> = { plaafp, goals };

export function buildPacket(studentId: string): PacketSection[] {
  return SECTION_ORDER.map((def) => {
    const b = BUILDERS[def.id];
    return { ...def, built: b !== undefined, items: b ? b(studentId) : [] };
  });
}

export const itemHash = (item: PacketItem) => fingerprint([item.id, item.text ?? ""]);
export const sectionHash = (s: PacketSection) => fingerprint(s.items.map(itemHash));

// ---- checklist ----

export interface Mark {
  who: string;
  at: string;
  hash: string;
}
export interface PacketRecord {
  studentId: string;
  /** item id -> fingerprint when copied */
  copied: Record<string, string>;
  /** section id -> mark */
  marked: Record<string, Mark>;
}

export const SRS_KEY = "goalline-practice-srs-v1";

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
const strMap = (v: unknown): v is Record<string, string> =>
  isRec(v) && Object.values(v).every((x) => typeof x === "string");
const markMap = (v: unknown): v is Record<string, Mark> =>
  isRec(v) &&
  Object.values(v).every(
    (m) =>
      isRec(m) &&
      typeof m["who"] === "string" &&
      typeof m["at"] === "string" &&
      typeof m["hash"] === "string",
  );

function load(): Map<string, PacketRecord> {
  const out = new Map<string, PacketRecord>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SRS_KEY) ?? "[]");
    if (Array.isArray(raw))
      for (const r of raw)
        if (
          isRec(r) &&
          typeof r["studentId"] === "string" &&
          strMap(r["copied"]) &&
          markMap(r["marked"])
        )
          out.set(r["studentId"], r as unknown as PacketRecord);
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getPacketVersion = () => version;
export function subscribePacket(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function commit(next: PacketRecord) {
  records.set(next.studentId, next);
  try {
    storage?.setItem(SRS_KEY, JSON.stringify([...records.values()]));
  } catch {
    // storage full or blocked: the checklist still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function usePacketStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetPacketForTests() {
  records = new Map();
  try {
    storage?.setItem(SRS_KEY, "[]");
  } catch {
    // ignore
  }
  version++;
  for (const l of listeners) l();
}

export const getPacket = (studentId: string): PacketRecord =>
  records.get(studentId) ?? { studentId, copied: {}, marked: {} };

/** Items with text, and whether each was copied in its current form. */
export const isCopied = (rec: PacketRecord, item: PacketItem) =>
  item.text !== undefined && rec.copied[item.id] === itemHash(item);

export function markCopied(studentId: string, item: PacketItem) {
  if (item.text === undefined) return;
  const rec = getPacket(studentId);
  commit({ ...rec, copied: { ...rec.copied, [item.id]: itemHash(item) } });
}

export type SectionState = "not_built" | "blocked" | "empty" | "ready" | "pasted" | "changed";

export function sectionState(rec: PacketRecord, s: PacketSection): SectionState {
  if (!s.built) return "not_built";
  const mark = rec.marked[s.id];
  if (mark) return mark.hash === sectionHash(s) ? "pasted" : "changed";
  if (s.items.some((i) => i.blocked)) return "blocked";
  if (s.items.length === 0) return "empty";
  return "ready";
}

/** The section can be marked pasted when nothing is blocked and every item with text was copied. */
export const canMark = (rec: PacketRecord, s: PacketSection) =>
  s.built &&
  s.items.length > 0 &&
  !s.items.some((i) => i.blocked) &&
  s.items.every((i) => i.text === undefined || isCopied(rec, i));

export function setMarked(
  studentId: string,
  s: PacketSection,
  on: boolean,
  who: string,
  now = new Date(),
) {
  const rec = getPacket(studentId);
  const marked = { ...rec.marked };
  if (on) {
    if (!canMark(rec, s)) return false;
    marked[s.id] = { who, at: now.toISOString(), hash: sectionHash(s) };
  } else delete marked[s.id];
  commit({ ...rec, marked });
  return true;
}
