import { useSyncExternalStore } from "react";
import {
  getIepShort,
  getIepShortVersion,
  subscribeIepShort,
  updateIepShort,
  reviewDate,
  usDate,
} from "../../data/iepShort.ts";

export const section = "header";

export function Form({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeIepShort, getIepShortVersion, getIepShortVersion);
  const r = getIepShort(studentId);
  const set = (change: Parameters<typeof updateIepShort>[1]) => updateIepShort(studentId, change);
  return (
    <details>
      <summary>Enter the dates and school</summary>
      <label>
        IEP effective date
        <input
          type="date"
          value={r.effective}
          onChange={(e) => set((x) => ({ ...x, effective: e.target.value }))}
        />
      </label>
      {r.effective && (
        <p className="meta">Review within a year: {usDate(reviewDate(r.effective))}</p>
      )}
      <label>
        Meeting date
        <input
          type="date"
          value={r.meeting}
          onChange={(e) => set((x) => ({ ...x, meeting: e.target.value }))}
        />
      </label>
      <label>
        School
        <input
          maxLength={120}
          value={r.school}
          onChange={(e) => set((x) => ({ ...x, school: e.target.value }))}
        />
      </label>
    </details>
  );
}
