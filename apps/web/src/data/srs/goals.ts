import { scrub, studentById } from "../district.ts";
import type { Builder } from "../srsPacket.ts";

export const section = "goals";

export const items: Builder = (studentId) => {
  const view = studentById(studentId);
  if (!view) return [];
  return view.goals.flatMap(({ goal, plan }, i) => {
    const n = i + 1;
    const unit = plan.unit ?? plan.type.replaceAll("_", " ");
    return [
      {
        id: `${goal.id}.statement`,
        label: `Goal ${n}: annual goal`,
        text: scrub(goal.statement, view.student),
      },
      ...(goal.baseline.trim()
        ? [
            {
              id: `${goal.id}.baseline`,
              label: `Goal ${n}: baseline`,
              text: scrub(goal.baseline, view.student),
            },
          ]
        : []),
      {
        id: `${goal.id}.measure`,
        label: `Goal ${n}: how progress is measured`,
        text: `Target ${plan.target_value} ${unit}, recorded ${plan.frequency}.`,
      },
    ];
  });
};
