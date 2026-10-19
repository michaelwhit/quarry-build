import type { MeasurementPlan } from "@synthetic/src/types.ts";

/** What a teacher has tapped so far in one monitoring session. */
export interface SessionState {
  correct: number;
  incorrect: number;
  count: number;
  seconds: number;
  /** Index into the plan's prompt_hierarchy, or a rubric score. */
  level: number | null;
  steps: boolean[];
  yes: boolean | null;
}

export const emptySession = (plan: MeasurementPlan): SessionState => ({
  correct: 0,
  incorrect: 0,
  count: 0,
  seconds: 0,
  level: null,
  steps: plan.task_steps.map(() => false),
  yes: null,
});

export type InputKind = "trials" | "tally" | "timer" | "level" | "rubric" | "steps" | "yesno";

export function inputKind(plan: MeasurementPlan): InputKind {
  switch (plan.type) {
    case "percent_correct":
    case "trials":
      return "trials";
    case "frequency":
    case "rate":
      return "tally";
    case "duration":
    case "latency":
      return "timer";
    case "prompt_level":
      return "level";
    case "rubric":
      return "rubric";
    case "task_analysis":
      return "steps";
    case "yes_no":
      return "yesno";
  }
}

/** The one number saved for the session, on the same scale as the plan's target_value. */
export function sessionValue(plan: MeasurementPlan, s: SessionState): number | null {
  switch (inputKind(plan)) {
    case "trials": {
      const total = s.correct + s.incorrect;
      if (total === 0) return null;
      // percent_correct targets are percentages; trials targets are counts out of the session size.
      return plan.type === "percent_correct"
        ? Math.round((s.correct / total) * 100)
        : plan.trials_per_session
          ? Math.round((s.correct / total) * plan.trials_per_session * 10) / 10
          : s.correct;
    }
    case "tally":
      return s.count;
    case "timer":
      return s.seconds === 0 ? null : Math.round((s.seconds / 60) * 10) / 10;
    case "level":
    case "rubric":
      return s.level;
    case "steps":
      return s.steps.filter(Boolean).length;
    case "yesno":
      return s.yes === null ? null : s.yes ? 1 : 0;
  }
}

export const hasInput = (plan: MeasurementPlan, s: SessionState) => sessionValue(plan, s) !== null;
