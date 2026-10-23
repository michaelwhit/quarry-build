import type { Goal, MeasurementPlan } from "@synthetic/src/types.ts";
import { targetText } from "../data/targetText.ts";

const TYPE_LABEL: Record<string, string> = {
  percent_correct: "Percent correct",
  trials: "Trials correct",
  frequency: "Frequency count",
  rate: "Rate",
  duration: "Duration",
  latency: "Latency",
  rubric: "Rubric score",
  prompt_level: "Prompt level",
  task_analysis: "Task analysis (steps)",
  yes_no: "Yes or no",
};

/** The whole goal, open by default: full wording plus how it is measured, baseline and target. */
export function GoalPanel({
  goal,
  plan,
  capHeight = false,
}: {
  goal: Goal;
  plan: MeasurementPlan;
  capHeight?: boolean;
}) {
  return (
    <details
      className={capHeight ? "whole cap" : "whole"}
      open
      {...(capHeight ? { tabIndex: 0, "aria-label": "Whole goal, scrollable" } : {})}
    >
      <summary>Whole goal</summary>
      <p>{goal.statement}</p>
      <dl>
        <dt>Measured by</dt>
        <dd>
          {TYPE_LABEL[plan.type] ?? plan.type}, {plan.frequency}
          {plan.trials_per_session ? `, ${plan.trials_per_session} trials per session` : ""}
        </dd>
        <dt>Baseline</dt>
        <dd>{goal.baseline}</dd>
        <dt>Target</dt>
        <dd>{targetText(goal.target, plan.target_value, plan.unit)}</dd>
        <dt>Criteria</dt>
        <dd>{goal.criteria}</dd>
        {plan.prompt_hierarchy.length > 0 && (
          <>
            <dt>Prompt levels</dt>
            <dd>{plan.prompt_hierarchy.join(" → ")}</dd>
          </>
        )}
        {plan.task_steps.length > 0 && (
          <>
            <dt>Steps</dt>
            <dd>{plan.task_steps.join(", ")}</dd>
          </>
        )}
      </dl>
    </details>
  );
}
