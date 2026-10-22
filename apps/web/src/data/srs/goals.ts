import { scrub, studentById } from "../district.ts";
import { getGoalExtras, getGoalExtrasVersion, subscribeGoalExtras } from "../goalExtras.ts";
import type { Builder, PacketItem } from "../srsPacket.ts";

export const section = "goals";
export const subscribe = subscribeGoalExtras;
export const version = getGoalExtrasVersion;

export const items: Builder = (studentId) => {
  const view = studentById(studentId);
  if (!view) return [];
  return view.goals.flatMap(({ goal, plan }, i) => {
    const n = i + 1;
    const unit = plan.unit ?? plan.type.replaceAll("_", " ");
    const base = scrub(goal.baseline, view.student).trim().replace(/\.$/, "");
    // SRS has no baseline box: the baseline is written inside the measurable annual goal.
    const text = `${scrub(goal.statement, view.student).trim()}${base ? ` Baseline: ${base}.` : ""}`;
    const x = getGoalExtras(goal.id);
    const clean = (t: string) => scrub(t, view.student).trim();
    const typed = (id: string, label: string, text: string, why: string): PacketItem =>
      text ? { id, label, text } : { id, label, blocked: why };
    const instruments = clean(x.instruments);
    return [
      { id: `${goal.id}.statement`, label: `Goal ${n}: measurable annual goal`, text },
      ...x.objectives
        .map(clean)
        .filter((o) => o !== "")
        .map((o, k) => ({
          id: `${goal.id}.objective${k + 1}`,
          label: `Goal ${n}: short-term objective ${k + 1}`,
          text: o,
        })),
      x.schedule
        ? {
            id: `${goal.id}.schedule`,
            label: `Goal ${n}: progress report schedule`,
            pick: x.schedule,
          }
        : {
            id: `${goal.id}.schedule`,
            label: `Goal ${n}: progress report schedule`,
            blocked: "Choose how often progress is reported.",
          },
      {
        id: `${goal.id}.measure`,
        label: `Goal ${n}: evaluation procedures`,
        text: instruments
          ? `${instruments} Target ${plan.target_value} ${unit}, recorded ${plan.frequency}.`
          : `Target ${plan.target_value} ${unit}, recorded ${plan.frequency}.`,
      },
      typed(
        `${goal.id}.responsible`,
        `Goal ${n}: person responsible`,
        clean(x.responsible),
        "Enter who is responsible.",
      ),
      x.parentReport
        ? {
            id: `${goal.id}.parent`,
            label: `Goal ${n}: how progress is reported to parents`,
            pick: x.parentReport,
          }
        : {
            id: `${goal.id}.parent`,
            label: `Goal ${n}: how progress is reported to parents`,
            blocked: "Choose how parents are told.",
          },
    ];
  });
};
