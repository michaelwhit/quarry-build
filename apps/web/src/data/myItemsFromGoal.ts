import type { GoalArea, MeasurementType } from "@synthetic/src/types.ts";
import { clip } from "./codePoints.ts";
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

/**
 * Replaces each of the student's names with `to`. Names match as the record spells them, in that
 * case only, so a student called Will does not turn every "will" in the sentence into the student.
 * One pass, so a replaced name is not rescanned.
 */
export function replaceNames(text: string, names: string[], to: string): string {
  const wanted = [
    ...new Set(
      names.map((n) => n.trim()).filter((n) => n.length >= 2 && !/^(?:student|date)$/i.test(n)),
    ),
  ].sort((x, y) => y.length - x.length);
  if (wanted.length === 0) return text;
  return text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])(?:${wanted.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu"),
    () => to,
  );
}

/** The wording with each of the student's names as {student} and each date as {date}. */
export function templateText(statement: string, names: string[]): string {
  // Braces are the template's own marks, so any the teacher typed become parentheses.
  const text = replaceNames(
    statement.trim().replace(/\{/g, "(").replace(/\}/g, ")"),
    names,
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

const COUNT_WORD =
  "(?:consecutive|sessions?|days?|checks?|trials?|probes?|opportunities|weeks?|samples?|observations?)\\b";

/**
 * How many times: "3 times in a row" or "3 consecutive sessions" is consecutive, and "4 of 5
 * sessions" is best of. An "8 of 10 problems" is accuracy inside one session, not a window, so
 * "N of M" counts only when a word like sessions, days or checks follows. Zero when unsaid.
 */
export function windowFrom(
  criteria: string,
  statement: string,
): Pick<Mastery, "window_kind" | "window_count" | "window_of"> {
  const text = `${criteria} ${statement}`;
  const row = /\b(\d{1,2})\s+(?:consecutive|times in a row|sessions in a row|days in a row)/i.exec(
    text,
  );
  if (row)
    return { window_kind: "consecutive", window_count: Number(row[1]), window_of: Number(row[1]) };
  const of = new RegExp(
    `\\b(\\d{1,2})\\s+of\\s+(?:the\\s+(?:last|next)\\s+)?(\\d{1,2})\\s+${COUNT_WORD}`,
    "i",
  ).exec(text);
  if (of) return { window_kind: "best_of", window_count: Number(of[1]), window_of: Number(of[2]) };
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
    title: clip(replaceNames(g.title.trim(), g.names, "the student"), 120) || "My goal",
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
    prompt_hierarchy: g.promptHierarchy.map((x) => replaceNames(x, g.names, "the student")),
    task_steps: g.taskSteps.map((x) => replaceNames(x, g.names, "the student")),
    baseline_guidance: "",
    objective_ladder: [],
    related_accommodation_ids: [],
  };
  // The date blank is filled with a far-off date so the checks look at the wording, not at today.
  const notes = checks(item, { date: "9999-12-31" }, today).filter((c) => !c.pass);
  return { item, notes };
}
