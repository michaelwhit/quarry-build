import { CONSIDERATIONS_KEY } from "./considerations.ts";
import { FAVORITES_KEY } from "./libraryFavorites.ts";
import { GOAL_EXTRAS_KEY } from "./goalExtras.ts";
import { IEP_SHORT_KEY } from "./iepShort.ts";
import { PLACEMENT_KEY } from "./placement.ts";
import { PL_KEY } from "./presentLevels.ts";
import { PWN_KEY } from "./pwnStore.ts";
import { REPORTS_KEY } from "./reports.ts";
import { SERVICES_KEY } from "./serviceRows.ts";
import { SERVICE_LOG_KEY } from "./serviceLogStore.ts";
import { SRS_KEY } from "./srsPacket.ts";
import { TRANSITION_KEY } from "./transition.ts";
import { STORAGE_KEY } from "./workspace.ts";

/**
 * Every browser storage key the practice app keeps student-shaped text under. Clearing practice
 * data or ending a session must remove all of them, not only the students: the service log, Prior
 * Written Notice, present levels and the rest are kept apart from the student list. A test fails
 * when a new `goalline-practice-` key appears in src/data without being listed here.
 */
export const PRACTICE_KEYS: readonly string[] = [
  STORAGE_KEY,
  SERVICES_KEY,
  SERVICE_LOG_KEY,
  PWN_KEY,
  PL_KEY,
  SRS_KEY,
  REPORTS_KEY,
  GOAL_EXTRAS_KEY,
  PLACEMENT_KEY,
  TRANSITION_KEY,
  CONSIDERATIONS_KEY,
  IEP_SHORT_KEY,
  FAVORITES_KEY,
];

interface Removable {
  removeItem(key: string): void;
}

/**
 * Remove every practice key from the given stores (the browser's local and session storage by
 * default). Returns how many removals were attempted. The modules keep a copy in memory, so the
 * caller reloads the page afterwards.
 */
export function clearPracticeStorage(stores?: Removable[]): number {
  const list: Removable[] = stores ?? browserStores();
  let n = 0;
  for (const s of list)
    for (const k of PRACTICE_KEYS) {
      try {
        s.removeItem(k);
        n++;
      } catch {
        // A blocked store has nothing to clear.
      }
    }
  return n;
}

function browserStores(): Removable[] {
  const out: Removable[] = [];
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      out.push(get());
    } catch {
      // Storage may be blocked in a private window.
    }
  }
  return typeof window === "undefined" ? [] : out;
}
