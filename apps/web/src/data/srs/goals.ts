import { scrub, studentById } from "../district.ts";
import type { Builder } from "../srsPacket.ts";

export const section = "goals";

export const items: Builder = (studentId) => {
  const view = studentById(studentId);
  if (!view) return [];
  return view.goals.flatMap(({ goal, plan }, i) => {
    const n = i + 1;
    const unit = plan.unit ?? plan.type.replaceAll("_", " ");
    const base = scrub(goal.baseline, view.student).trim().replace(/\.$/, "");
    // SRS has no baseline box: the baseline is written inside the measurable annual goal.
    const text = `${scrub(goal.statement, view.student).trim()}${base ? ` Baseline: ${base}.` : ""}`;
    return [
      { id: `${goal.id}.statement`, label: `Goal ${n}: measurable annual goal`, text },
      {
        id: `${goal.id}.measure`,
        label: `Goal ${n}: evaluation procedures`,
        text: `Target ${plan.target_value} ${unit}, recorded ${plan.frequency}.`,
      },
    ];
  });
};
