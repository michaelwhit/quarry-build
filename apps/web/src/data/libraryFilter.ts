import type { AccommodationItem, GoalItem } from "./library.ts";
import { goalAreaLabel } from "./library.ts";
import { label } from "./libraryText.ts";

// Search and filters for the sample libraries. Pure functions so the screen stays thin.

/** Lower case, letters and digits only, so "Read-aloud" and "read aloud" match. */
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** True when every word typed starts a word of the text, in any order. An empty search matches. */
export function matchesQuery(text: string, query: string): boolean {
  const wanted = words(query);
  if (wanted.length === 0) return true;
  const have = words(text);
  return wanted.every((w) => have.some((h) => h.startsWith(w)));
}

export interface GoalFilter {
  query: string;
  band: string;
  area: string;
  /** When set, only these ids. */
  only?: Set<string> | undefined;
}

export interface AccommodationFilter {
  query: string;
  kind: string;
  category: string;
  /** When set, only these ids. */
  only?: Set<string> | undefined;
}

const goalText = (g: GoalItem) =>
  [
    g.title,
    g.template_text.replace(/[{}_]/g, " "),
    g.condition_text.replace(/[{}_]/g, " "),
    g.behavior_text,
    goalAreaLabel[g.area] ?? "",
    g.objective_ladder.join(" "),
    g.slots.map((s) => label(s.name)).join(" "),
  ].join(" ");

export const filterGoals = (all: GoalItem[], f: GoalFilter) =>
  all.filter(
    (g) =>
      (!f.only || f.only.has(g.id)) &&
      (!f.band || g.grade_bands.some((b) => b === f.band)) &&
      (!f.area || g.area === f.area) &&
      matchesQuery(goalText(g), f.query),
  );

export const filterAccommodations = (all: AccommodationItem[], f: AccommodationFilter) =>
  all.filter(
    (a) =>
      (!f.only || f.only.has(a.id)) &&
      (!f.kind || a.kind === f.kind) &&
      (!f.category || a.category === f.category) &&
      matchesQuery(`${a.title} ${a.description} ${a.category} ${a.frequency}`, f.query),
  );

/** The categories in use, sorted, for the filter list. */
export const categoriesOf = (all: AccommodationItem[]) =>
  [...new Set(all.map((a) => a.category))].sort((a, b) => a.localeCompare(b));
