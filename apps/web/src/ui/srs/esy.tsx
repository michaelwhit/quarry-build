import { useSyncExternalStore } from "react";
import { ESY_NOT_NEEDED } from "../../data/srs/esy.ts";
import {
  getIepShort,
  getIepShortVersion,
  subscribeIepShort,
  updateIepShort,
} from "../../data/iepShort.ts";

export const section = "esy";

export function Form({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeIepShort, getIepShortVersion, getIepShortVersion);
  const r = getIepShort(studentId);
  const set = (change: Parameters<typeof updateIepShort>[1]) => updateIepShort(studentId, change);
  return (
    <details>
      <summary>Write the extended school year box</summary>
      <label className="check">
        <input
          type="radio"
          name="esy-choice"
          checked={r.esy?.choice === "not_needed"}
          onChange={() =>
            set((x) => ({ ...x, esy: { choice: "not_needed", text: x.esy?.text ?? "" } }))
          }
        />
        Considered, not needed
      </label>
      <label className="check">
        <input
          type="radio"
          name="esy-choice"
          checked={r.esy?.choice === "needed"}
          onChange={() =>
            set((x) => ({ ...x, esy: { choice: "needed", text: x.esy?.text ?? "" } }))
          }
        />
        Services needed
      </label>
      {r.esy && (
        <label>
          {r.esy.choice === "needed" ? "Describe the services" : "Data-based reason (optional)"}
          <textarea
            rows={3}
            maxLength={2000}
            value={r.esy.text}
            onChange={(e) =>
              set((x) => ({ ...x, esy: { choice: r.esy!.choice, text: e.target.value } }))
            }
          />
        </label>
      )}
      {r.esy?.choice === "not_needed" && <p className="meta">Starts with: {ESY_NOT_NEEDED}</p>}
    </details>
  );
}
