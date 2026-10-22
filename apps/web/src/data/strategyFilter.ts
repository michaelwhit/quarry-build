import { matchesQuery } from "./libraryFilter.ts";
import { type StrategyItem, TIER_LABEL, UDL_LABEL } from "./strategies.ts";

// Search and filters for the sample strategy library. Pure functions so the screen stays thin.

export interface StrategyFilter {
  query: string;
  /** Empty means any. Otherwise "1", "2" or "3". */
  tier: string;
  udl: string;
  area: string;
  band: string;
  /** When set, only these ids. */
  only?: Set<string> | undefined;
}

export const noStrategyFilter: StrategyFilter = {
  query: "",
  tier: "",
  udl: "",
  area: "",
  band: "",
};

const text = (x: StrategyItem) =>
  [
    x.title,
    x.description,
    x.steps.join(" "),
    x.watch_for,
    TIER_LABEL[x.tier],
    UDL_LABEL[x.udl],
  ].join(" ");

export const filterStrategies = (all: StrategyItem[], f: StrategyFilter) =>
  all.filter(
    (x) =>
      (!f.only || f.only.has(x.id)) &&
      (!f.tier || String(x.tier) === f.tier) &&
      (!f.udl || x.udl === f.udl) &&
      (!f.area || x.area === f.area) &&
      (!f.band || x.grade_bands.some((b) => b === f.band)) &&
      matchesQuery(text(x), f.query),
  );

/** The areas in use, sorted, for the filter list. */
export const strategyAreas = (all: StrategyItem[]) =>
  [...new Set(all.map((x) => x.area))].sort((a, b) => a.localeCompare(b));
