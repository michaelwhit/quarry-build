// The "special considerations" boxes of the IEP (practice data only). For each one the team
// either considered it and decided it is not needed, or it is needed and the teacher writes it.
// Kept in this browser's storage next to the other practice drafts; nothing is sent anywhere.
import { clip } from "./codePoints.ts";

export const BOXES: { id: string; label: string }[] = [
  { id: "behavior", label: "Behavior that impedes learning: positive behavioral interventions" },
  { id: "lep", label: "Limited English proficiency: language needs" },
  { id: "vision", label: "Blind or visually impaired: Braille" },
  { id: "communication", label: "The child's communication needs" },
  { id: "deaf1", label: "Deaf or hard of hearing: language and communication needs" },
  {
    id: "deaf2",
    label: "Deaf or hard of hearing: direct communication with peers and professionals",
  },
  { id: "deaf3", label: "Deaf or hard of hearing: academic level and direct instruction" },
  { id: "at", label: "Assistive technology service or device" },
];

/** The district's own standard sentence is to be confirmed inside SRS; this is the placeholder. */
export const NOT_NEEDED =
  "This was considered by the IEP team, but was deemed unnecessary at the time.";

export type Choice = "not_needed" | "needed";
export interface Consideration {
  choice: Choice;
  /** Not needed: an optional reason. Needed: what the team decided. */
  text: string;
}
export type StudentConsiderations = Record<string, Consideration>;

export const CONSIDERATIONS_KEY = "goalline-practice-considerations-v1";

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
const validEntry = (v: unknown): v is Consideration =>
  isRec(v) &&
  (v["choice"] === "not_needed" || v["choice"] === "needed") &&
  typeof v["text"] === "string";

function load(): Map<string, StudentConsiderations> {
  const out = new Map<string, StudentConsiderations>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(CONSIDERATIONS_KEY) ?? "{}");
    if (isRec(raw))
      for (const [sid, boxes] of Object.entries(raw)) {
        if (!isRec(boxes)) continue;
        const kept: StudentConsiderations = {};
        for (const b of BOXES) {
          const e = boxes[b.id];
          if (validEntry(e)) kept[b.id] = { choice: e.choice, text: clip(e.text, 2000) };
        }
        out.set(sid, kept);
      }
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getConsiderationsVersion = () => version;
export function subscribeConsiderations(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function save() {
  try {
    storage?.setItem(CONSIDERATIONS_KEY, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // storage full or blocked: the work still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function useConsiderationStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetConsiderationsForTests() {
  records = new Map();
  save();
}

export const getConsiderations = (studentId: string): StudentConsiderations =>
  records.get(studentId) ?? {};

export function setConsideration(studentId: string, boxId: string, entry: Consideration | null) {
  if (!BOXES.some((b) => b.id === boxId)) return;
  const next = { ...getConsiderations(studentId) };
  if (entry) next[boxId] = { choice: entry.choice, text: clip(entry.text, 2000) };
  else delete next[boxId];
  records.set(studentId, next);
  save();
}

/** The text to paste, or why there is none yet. */
export function considerationText(
  e: Consideration | undefined,
): { text: string } | { blocked: string } {
  if (!e)
    return {
      blocked: "Choose whether the team considered this and found it not needed, or needed.",
    };
  const t = e.text.trim();
  if (e.choice === "needed") return t ? { text: t } : { blocked: "Write what the team decided." };
  return { text: t ? `${NOT_NEEDED} ${t}` : NOT_NEEDED };
}
