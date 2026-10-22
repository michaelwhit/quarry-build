import { useSyncExternalStore } from "react";
import { studentById } from "../../data/district.ts";
import {
  MAX_OBJECTIVES,
  PARENT_REPORTS,
  SCHEDULES,
  getGoalExtras,
  getGoalExtrasVersion,
  subscribeGoalExtras,
  updateGoalExtras,
} from "../../data/goalExtras.ts";

export const section = "goals";

/** Per goal: short-term objectives, report schedule, instruments, person responsible, parents. */
export function Form({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeGoalExtras, getGoalExtrasVersion, getGoalExtrasVersion);
  const goals = studentById(studentId)?.goals ?? [];
  if (goals.length === 0) return null;
  return (
    <details>
      <summary>Write the progress report boxes for each goal</summary>
      {goals.map(({ goal }, i) => {
        const x = getGoalExtras(goal.id);
        const set = (p: Partial<typeof x>) => updateGoalExtras(goal.id, (r) => ({ ...r, ...p }));
        return (
          <fieldset key={goal.id}>
            <legend>Goal {i + 1}</legend>
            {x.objectives.map((o, k) => (
              <label key={k}>
                Short-term objective {k + 1}
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={o}
                  onChange={(e) =>
                    set({ objectives: x.objectives.map((y, j) => (j === k ? e.target.value : y)) })
                  }
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => set({ objectives: x.objectives.filter((_, j) => j !== k) })}
                >
                  Remove objective {k + 1}
                </button>
              </label>
            ))}
            {x.objectives.length < MAX_OBJECTIVES && (
              <button
                type="button"
                className="btn"
                onClick={() => set({ objectives: [...x.objectives, ""] })}
              >
                Add short-term objective
              </button>
            )}
            <label>
              Progress report schedule
              <select value={x.schedule} onChange={(e) => set({ schedule: e.target.value })}>
                <option value="">Choose…</option>
                {SCHEDULES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Evaluation instruments (optional, added before the target line)
              <input
                maxLength={500}
                value={x.instruments}
                onChange={(e) => set({ instruments: e.target.value })}
              />
            </label>
            <label>
              Person responsible
              <input
                maxLength={200}
                value={x.responsible}
                onChange={(e) => set({ responsible: e.target.value })}
              />
            </label>
            <label>
              How progress is reported to parents
              <select
                value={x.parentReport}
                onChange={(e) => set({ parentReport: e.target.value })}
              >
                <option value="">Choose…</option>
                {PARENT_REPORTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </fieldset>
        );
      })}
    </details>
  );
}
