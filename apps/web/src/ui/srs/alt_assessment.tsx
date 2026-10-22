import { useSyncExternalStore } from "react";
import {
  getIepShort,
  getIepShortVersion,
  subscribeIepShort,
  updateIepShort,
} from "../../data/iepShort.ts";

export const section = "alt_assessment";

export function Form({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeIepShort, getIepShortVersion, getIepShortVersion);
  const r = getIepShort(studentId);
  const set = (change: Parameters<typeof updateIepShort>[1]) => updateIepShort(studentId, change);
  return (
    <details>
      <summary>Answer and explain</summary>
      <label>
        Required to take the state assessment
        <select
          value={r.altRequired}
          onChange={(e) =>
            set((x) => ({ ...x, altRequired: e.target.value as typeof r.altRequired }))
          }
        >
          <option value="">Choose…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>
        Explanation{r.altRequired === "no" ? " (required)" : " (optional)"}
        <textarea
          rows={3}
          maxLength={2000}
          value={r.altWhy}
          onChange={(e) => set((x) => ({ ...x, altWhy: e.target.value }))}
        />
      </label>
    </details>
  );
}
