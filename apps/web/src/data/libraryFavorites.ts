// A teacher's starred goals and accommodations, kept in this browser only. Practice data: nothing
// is sent anywhere and nothing here is part of a student's record.

export const FAVORITES_KEY = "goalline-practice-library-favorites-v1";
/** More than the whole sample library, so a full star-everything never hits it. */
const MAX_PER_KIND = 200;
const MAX_ID = 60;

export interface Favorites {
  goals: Set<string>;
  accommodations: Set<string>;
}

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

/** For tests: use another store, or none. */
export function useFavoritesStorage(s: StorageLike | null) {
  storage = s;
}

export const emptyFavorites = (): Favorites => ({
  goals: new Set(),
  accommodations: new Set(),
});

const idsOf = (v: unknown, known: Set<string>): Set<string> => {
  const out = new Set<string>();
  if (!Array.isArray(v)) return out;
  for (const x of v)
    if (typeof x === "string" && x.length <= MAX_ID && known.has(x) && out.size < MAX_PER_KIND)
      out.add(x);
  return out;
};

/** Reads the saved stars. Ids the library no longer has are dropped; anything unreadable is empty. */
export function loadFavorites(goalIds: string[], accommodationIds: string[]): Favorites {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(FAVORITES_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return emptyFavorites();
    const r = raw as Record<string, unknown>;
    return {
      goals: idsOf(r["goals"], new Set(goalIds)),
      accommodations: idsOf(r["accommodations"], new Set(accommodationIds)),
    };
  } catch {
    return emptyFavorites();
  }
}

/** Saves the stars; false when the browser would not keep them (private window, full storage). */
export function saveFavorites(f: Favorites): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      FAVORITES_KEY,
      JSON.stringify({ goals: [...f.goals].sort(), accommodations: [...f.accommodations].sort() }),
    );
    return true;
  } catch {
    return false;
  }
}

/** A new set with the id starred or unstarred. */
export function toggled(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
