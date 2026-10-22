// Placement, health and transportation for one student (practice data only). Three short parts of
// the IEP: the least restrictive environment box, the health and Physical Education boxes, and
// the transportation answer. The teacher writes them here, then copies each into SRS by hand.
// Kept in this browser's storage next to the other practice drafts; nothing is sent anywhere.

export type Transport = "yes" | "no";
export interface Placement {
  lre: string;
  health: string;
  pe: string;
  transport: Transport | null;
}

export const PLACEMENT_KEY = "goalline-practice-placement-v1";
export const MAX_TEXT = 4000;

const EMPTY: Placement = { lre: "", health: "", pe: "", transport: null };

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
const text = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : "");

function load(): Map<string, Placement> {
  const out = new Map<string, Placement>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(PLACEMENT_KEY) ?? "{}");
    if (isRec(raw))
      for (const [sid, v] of Object.entries(raw)) {
        if (!isRec(v)) continue;
        const t = v["transport"];
        out.set(sid, {
          lre: text(v["lre"]),
          health: text(v["health"]),
          pe: text(v["pe"]),
          transport: t === "yes" || t === "no" ? t : null,
        });
      }
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getPlacementVersion = () => version;
export function subscribePlacement(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function save() {
  try {
    storage?.setItem(PLACEMENT_KEY, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // storage full or blocked: the work still stands for this visit
  }
  version++;
  for (const l of listeners) l();
}
export function usePlacementStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  version++;
  for (const l of listeners) l();
}
export function resetPlacementForTests() {
  records = new Map();
  save();
}

export const getPlacement = (studentId: string): Placement => records.get(studentId) ?? EMPTY;

export function setPlacement(studentId: string, patch: Partial<Placement>) {
  const cur = getPlacement(studentId);
  const next: Placement = {
    lre: patch.lre !== undefined ? text(patch.lre) : cur.lre,
    health: patch.health !== undefined ? text(patch.health) : cur.health,
    pe: patch.pe !== undefined ? text(patch.pe) : cur.pe,
    transport: patch.transport !== undefined ? patch.transport : cur.transport,
  };
  records.set(studentId, next);
  save();
}
