import type { GoalArea, MeasurementType } from "@synthetic/src/types.ts";
import { dateWithYear } from "./dates.ts";
import { STATUS_LABEL } from "./derive.ts";
import { scrub, studentById } from "./district.ts";
import { type Area, AREAS, getPl } from "./presentLevels.ts";
import { targetText } from "./targetText.ts";

// The golden thread (practice data only): for each goal, a chain from the stated need in present
// levels, to the goal, to how it is measured, to the latest data collected. The last link is real
// data, so a goal with no data says so. Services are not linked to a single goal yet, so they are
// not part of the chain. Everything is read from the teacher's own entries and the practice data;
// nothing is invented, and the flags are plain rules, not a model.

/** Which present-levels area a goal's need is written under. */
export function needArea(a: GoalArea): Area {
  if (a === "reading" || a === "written_expression") return "reading";
  if (a === "math") return "math";
  return "other";
}

const MEASURE_LABEL: Record<MeasurementType, string> = {
  percent_correct: "Percent correct",
  trials: "Trials correct",
  frequency: "Count",
  rate: "Rate",
  duration: "Duration",
  latency: "Latency",
  rubric: "Rubric score",
  prompt_level: "Prompt level",
  task_analysis: "Steps done",
  yes_no: "Yes or no",
};

export interface ThreadRow {
  goalId: string;
  /** The goal's area in plain words. */
  area: string;
  /** Confirmed needs written under the matching present-levels area; empty when there are none. */
  needs: string[];
  statement: string;
  /** Written baseline and target. */
  aim: string;
  measured: string;
  /** The last data point in words, or "" when there is none. */
  latest: string;
  status: string;
}

export interface ThreadFlag {
  level: "amber" | "info";
  text: string;
}

export interface Thread {
  rows: ThreadRow[];
  flags: ThreadFlag[];
}

const areaWords = (a: GoalArea) => a.replaceAll("_", " ");
const areaLabel = (a: Area) => AREAS.find((x) => x.id === a)?.label ?? a;

/** The chain for one student; empty when the student is unknown or not in view. */
export function buildThread(studentId: string): Thread {
  const view = studentById(studentId);
  if (!view) return { rows: [], flags: [] };
  const rec = getPl(studentId);
  const needs = (a: Area) =>
    rec.statements
      .filter((s) => s.state === "confirmed" && s.kind === "need" && s.area === a && s.text.trim())
      .map((s) => scrub(s.text.trim(), view.student));

  const rows: ThreadRow[] = view.goals.map(({ goal, plan, series, progress }) => {
    const last = series[series.length - 1];
    return {
      goalId: goal.id,
      area: areaWords(goal.area),
      needs: needs(needArea(goal.area)),
      statement: scrub(goal.statement, view.student),
      aim: [
        goal.baseline.trim() ? `Baseline: ${scrub(goal.baseline.trim(), view.student)}` : "",
        `Target: ${targetText(scrub(goal.target, view.student), plan.target_value, plan.unit)}`,
      ]
        .filter(Boolean)
        .join(". "),
      measured: `${MEASURE_LABEL[plan.type]}, target ${plan.target_value}${plan.unit ? ` ${plan.unit}` : ""}, recorded ${plan.frequency}.`,
      latest: last
        ? `${last.value}${plan.unit ? ` ${plan.unit}` : ""} on ${dateWithYear(last.at)}`
        : "",
      status: STATUS_LABEL[progress.status],
    };
  });

  const flags: ThreadFlag[] = [];
  const goalAreas = new Set(view.goals.map((g) => needArea(g.goal.area)));
  for (const a of AREAS)
    if (needs(a.id).length > 0 && !goalAreas.has(a.id))
      flags.push({
        level: "amber",
        text: `${areaLabel(a.id)}: a need is written in present levels but no goal covers it.`,
      });
  for (const a of goalAreas)
    if (needs(a).length === 0)
      flags.push({
        level: "amber",
        text: `${areaLabel(a)}: a goal has no confirmed need written under it in present levels.`,
      });
  for (const r of rows)
    if (!r.latest) flags.push({ level: "info", text: `The ${r.area} goal has no data yet.` });
  return { rows, flags };
}
