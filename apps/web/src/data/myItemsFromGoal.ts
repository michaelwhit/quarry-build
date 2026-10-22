import type { GoalArea, MeasurementType } from "@synthetic/src/types.ts";
import type { GoalItem, GradeBand } from "./library.ts";
import { type Check, type Mastery, checks } from "./libraryText.ts";

// Turns a goal a teacher wrote into a My items template: the student's name becomes {student},
// a date becomes the {date} blank, and the same measurability checks the library uses say what is
// still missing. Pure functions, so the form stays thin.

export interface GoalForTemplate {
  title: string;
  statement: string;
  criteria: string;
  area: GoalArea;
  type: MeasurementType;
  unit: string;
  targetValue: number;
  trialsPerSession: number | null;
  promptHierarchy: string[];
  taskSteps: string[];
  /** The student's names to take out of the wording. */
  names: string[];
  gradeBand: GradeBand | null;
}

/** Today as yyyy-mm-dd in the browser's own time zone. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE = new RegExp(
  `\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b(?:${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}\\b`,
  "gi",
);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The wording with each of the student's names as {student} and each date as {date}. */
export function templateText(statement: string, names: string[]): string {
  // Braces are the template's own marks, so any the teacher typed become parentheses.
  let text = statement.trim().replace(/\{/g, "(").replace(/\}/g, ")");
  const wanted = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  for (const n of wanted)
    text = text.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, "giu"),
      "{student}",
    );
  return text.replace(DATE, "{date}");
}

const COMMA_OR_WITH = /,|\s(?:with|in|at|on|by)\s/;

/** The part before "{student} will" and the first words after it. Empty when the wording has no such sentence. */
export function conditionAndBehavior(template: string): { condition: string; behavior: string } {
  const at = template.indexOf("{student} will ");
  if (at < 0) return { condition: "", behavior: "" };
  const condition = template
    .slice(0, at)
    .trim()
    .replace(/[,;:]$/, "")
    .trim();
  const after = template.slice(at + "{student} will ".length);
  const behavior = (after.split(COMMA_OR_WITH)[0] ?? "").trim().split(/\s+/).slice(0, 8).join(" ");
  return { condition, behavior };
}

/** How many times: "4 of 5" is best of, "3 times in a row" or "3 consecutive" is consecutive. Zero when unsaid. */
export function windowFrom(
  criteria: string,
  statement: string,
): Pick<Mastery, "window_kind" | "window_count" | "window_of"> {
  const text = `${criteria} ${statement}`;
  const of = /\b(\d{1,2})\s+of\s+(?:the\s+(?:last|next)\s+)?(\d{1,2})\b/i.exec(text);
  if (of) return { window_kind: "best_of", window_count: Number(of[1]), window_of: Number(of[2]) };
  const row = /\b(\d{1,2})\s+(?:consecutive|times in a row|sessions in a row|days in a row)/i.exec(
    text,
  );
  if (row)
    return { window_kind: "consecutive", window_count: Number(row[1]), window_of: Number(row[1]) };
  return { window_kind: "consecutive", window_count: 0, window_of: 0 };
}

export interface MyGoalDraft {
  item: Omit<GoalItem, "id">;
  /** What is still missing for the goal to read as measurable. Empty when it passes every check. */
  notes: Check[];
}

export function draftMyGoal(g: GoalForTemplate, today: string): MyGoalDraft {
  const template = templateText(g.statement, g.names);
  const { condition, behavior } = conditionAndBehavior(template);
  const hasDate = template.includes("{date}");
  const mastery: Mastery = {
    threshold: g.targetValue,
    unit: g.unit,
    comparator: ">=",
    ...windowFrom(g.criteria, g.statement),
    maintenance_check: false,
  };
  const item: Omit<GoalItem, "id"> = {
    title: g.title.trim().slice(0, 120) || "My goal",
    area: g.area,
    grade_bands: g.gradeBand ? [g.gradeBand] : [],
    template_text: template,
    condition_text: condition,
    behavior_text: behavior,
    slots: hasDate ? [{ name: "date", kind: "date" }] : [],
    mastery,
    method: g.type,
    type: g.type,
    unit: g.unit,
    target_value: g.targetValue,
    trials_per_session: g.trialsPerSession,
    prompt_hierarchy: g.promptHierarchy,
    task_steps: g.taskSteps,
    baseline_guidance: "",
    objective_ladder: [],
    related_accommodation_ids: [],
  };
  // The date blank is filled with a far-off date so the checks look at the wording, not at today.
  const notes = checks(item, { date: "9999-12-31" }, today).filter((c) => !c.pass);
  return { item, notes };
}
