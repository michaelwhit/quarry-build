import { addMyAccommodation, getMyAccommodations, isMyAccommodation } from "./myAccommodations.ts";
import { addMyGoal, getMyGoals, isMyGoal } from "./myItems.ts";
import type { GoalItem } from "./library.ts";

// My items (the teacher's own goal and accommodation wording) saved to a file and loaded back.
// The file holds wording only, with no student, and every entry is checked on the way in the same
// way as one read from the browser's storage, so a file cannot add anything a teacher could not.

export const MY_ITEMS_FILE_FORMAT = "goalline-my-items-file";
export const MY_ITEMS_FILE_NAME = "my-items.json";
export const MAX_MY_ITEMS_FILE_BYTES = 1_000_000;

export const hasMyItems = () => getMyGoals().length + getMyAccommodations().length > 0;

export function exportMyItems(): string {
  return JSON.stringify(
    {
      format: MY_ITEMS_FILE_FORMAT,
      version: 1,
      goals: getMyGoals(),
      accommodations: getMyAccommodations(),
    },
    null,
    2,
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Only the known fields are kept, so extra keys in a loaded file are not stored.
const knownGoalFields = (g: GoalItem): Omit<GoalItem, "id"> => ({
  title: g.title,
  area: g.area,
  grade_bands: g.grade_bands,
  type: g.type,
  unit: g.unit,
  target_value: g.target_value,
  ...(g.target_slot !== undefined ? { target_slot: g.target_slot } : {}),
  trials_per_session: g.trials_per_session,
  prompt_hierarchy: g.prompt_hierarchy,
  task_steps: g.task_steps,
  baseline_guidance: g.baseline_guidance,
  objective_ladder: g.objective_ladder,
  related_accommodation_ids: g.related_accommodation_ids,
  ...(g.requires_fba_bip !== undefined ? { requires_fba_bip: g.requires_fba_bip } : {}),
  template_text: g.template_text,
  condition_text: g.condition_text,
  behavior_text: g.behavior_text,
  slots: g.slots,
  mastery: g.mastery,
  method: g.method,
});

/** Adds the valid entries of a saved file to My items. Says what was added and what was left out. */
export function importMyItems(text: string): { message: string; added: number } {
  if (text.length > MAX_MY_ITEMS_FILE_BYTES)
    return { message: "That file is too large.", added: 0 };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { message: "That is not a My items file.", added: 0 };
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as Record<string, unknown>)["format"] !== MY_ITEMS_FILE_FORMAT
  )
    return { message: "That is not a My items file.", added: 0 };
  const body = raw as Record<string, unknown>;
  const goals = Array.isArray(body["goals"]) ? (body["goals"] as unknown[]) : [];
  const accs = Array.isArray(body["accommodations"]) ? (body["accommodations"] as unknown[]) : [];
  let addedGoals = 0;
  let addedAccs = 0;
  let left = 0;
  for (const g of goals) {
    if (!isMyGoal(g)) {
      left++;
      continue;
    }
    if (addMyGoal(knownGoalFields(g)).ok) addedGoals++;
    else left++;
  }
  for (const a of accs) {
    if (!isMyAccommodation(a)) {
      left++;
      continue;
    }
    const { id, ...rest } = a;
    void id;
    if (addMyAccommodation(rest).ok) addedAccs++;
    else left++;
  }
  const added = addedGoals + addedAccs;
  const tail = left > 0 ? ` Left out ${left}: already there, not usable, or the list is full.` : "";
  return {
    message:
      added === 0
        ? `Nothing was added.${tail}`
        : `Added ${plural(addedGoals, "goal", "goals")} and ${plural(addedAccs, "accommodation", "accommodations")} to My items.${tail}`,
    added,
  };
}
