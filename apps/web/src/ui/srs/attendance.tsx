import { useSyncExternalStore } from "react";
import {
  getIepShort,
  getIepShortVersion,
  subscribeIepShort,
  updateIepShort,
  PARENT_QUESTIONS,
  POSITIONS,
  addAttendee,
} from "../../data/iepShort.ts";

export const section = "attendance";

export function Form({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeIepShort, getIepShortVersion, getIepShortVersion);
  const r = getIepShort(studentId);
  const set = (change: Parameters<typeof updateIepShort>[1]) => updateIepShort(studentId, change);
  return (
    <details>
      <summary>Enter who was at the meeting</summary>
      {r.attendees.map((a, i) => {
        const change = (p: Partial<typeof a>) =>
          set((x) => ({
            ...x,
            attendees: x.attendees.map((y) => (y.id === a.id ? { ...y, ...p } : y)),
          }));
        return (
          <fieldset key={a.id}>
            <legend>Attendee {i + 1}</legend>
            <label>
              Name
              <input
                maxLength={120}
                value={a.name}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <label>
              Position
              <select value={a.position} onChange={(e) => change({ position: e.target.value })}>
                <option value="">Choose…</option>
                {POSITIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={a.date}
                onChange={(e) => change({ date: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={a.attended}
                onChange={(e) => change({ attended: e.target.checked })}
              />
              Attended
            </label>{" "}
            <button
              type="button"
              className="btn"
              onClick={() =>
                set((x) => ({ ...x, attendees: x.attendees.filter((y) => y.id !== a.id) }))
              }
            >
              Remove attendee {i + 1}
            </button>
          </fieldset>
        );
      })}
      <button type="button" className="btn" onClick={() => addAttendee(studentId)}>
        Add attendee
      </button>
      {PARENT_QUESTIONS.map((q, i) => (
        <label key={q}>
          {q}
          <select
            value={r.parent[i]}
            onChange={(e) =>
              set((x) => ({
                ...x,
                parent: x.parent.map((v, j) => (j === i ? e.target.value : v)),
              }))
            }
          >
            <option value="">Choose…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      ))}
    </details>
  );
}
