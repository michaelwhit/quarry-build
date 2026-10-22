import { displayName, students } from "./district.ts";
import { type GoalInput, getWorkspace } from "./workspace.ts";
import type { GoalItem, GradeBand } from "./library.ts";
import { checks, formSlots, initialValues, masteryLine, renderedText } from "./libraryText.ts";

// What a library goal can take from a student's record, so a teacher can add it in one tap.

/** The library grade band for a student's grade (PK, K, 1 to 12). Null when it is not one of those. */
export function gradeBandOf(grade: string): GradeBand | null {
  const g = grade.trim().toUpperCase();
  if (g === "PK") return "EC";
  if (g === "K") return "K-2";
  if (!/^\d{1,2}$/.test(g)) return null;
  const n = Number(g);
  if (n < 1 || n > 12) return null;
  if (n <= 2) return "K-2";
  if (n <= 5) return "3-5";
  if (n <= 8) return "6-8";
  return "9-12";
}

/** True when the goal is written for the student's grade; null when the grade is unknown. */
export function fitsGrade(goal: GoalItem, grade: string): boolean | null {
  const band = gradeBandOf(grade);
  return band === null ? null : goal.grade_bands.includes(band);
}

export interface StudentFacts {
  /** The first name or preferred name the wording uses. */
  name: string;
  grade: string;
  /** End of the current plan year, yyyy-mm-dd. */
  planEnds: string;
}

/**
 * The blanks a student's record can fill: the date is the end of the plan year, as long as that
 * is not already past. Choices keep the library's default. Blanks that need a teacher's decision
 * (a target number, a strategy) stay empty.
 */
export function fillFrom(
  goal: GoalItem,
  facts: StudentFacts,
  today: string,
): Record<string, string> {
  const values = initialValues(goal);
  const okDate = /^\d{4}-\d{2}-\d{2}$/.test(facts.planEnds) && facts.planEnds >= today;
  for (const s of formSlots(goal)) if (s.kind === "date" && okDate) values[s.name] = facts.planEnds;
  return values;
}

/** True when nothing but a tap is missing. Behavior goals still need the plan confirmation. */
export function oneTap(goal: GoalItem, values: Record<string, string>, today: string): boolean {
  return !goal.requires_fba_bip && checks(goal, values, today).every((c) => c.pass);
}

/** What `addGoal` needs for a library goal with every blank filled. Throws if the target is not a number. */
export function goalInput(
  goal: GoalItem,
  values: Record<string, string>,
  name: string | null,
  baseline = "",
): GoalInput {
  const targetValue =
    goal.target_value === "from_slot"
      ? Number(values[goal.target_slot ?? ""] ?? "")
      : goal.target_value;
  return {
    area: goal.area,
    statement: renderedText(goal, values, name),
    baseline,
    criteria: masteryLine(goal.mastery, values),
    type: goal.type,
    unit: goal.unit,
    targetValue,
    trialsPerSession: goal.trials_per_session,
    promptHierarchy: goal.prompt_hierarchy,
    taskSteps: goal.task_steps,
    frequency: "2x weekly",
  };
}

/** What a student's record gives a library goal: the name, grade and the end of the plan year. */
export function factsFor(studentId: string): StudentFacts | null {
  const sv = students.find((s) => s.student.id === studentId);
  if (!sv) return null;
  const iep = getWorkspace().ieps.find((i) => i.student_id === studentId);
  return {
    name: displayName(sv.student),
    grade: sv.student.grade,
    planEnds: iep?.effective_to ?? "",
  };
}
