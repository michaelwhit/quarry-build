import { useSyncExternalStore } from "react";
import { clip } from "../data/codePoints.ts";
import {
  BOXES,
  NOT_NEEDED,
  getConsiderations,
  getConsiderationsVersion,
  subscribeConsiderations,
  setConsideration,
  type Choice,
} from "../data/considerations.ts";

/** For each consideration box: considered and not needed, or needed with the team's text. */
export function Considerations({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeConsiderations, getConsiderationsVersion, getConsiderationsVersion);
  const mine = getConsiderations(studentId);
  return (
    <details>
      <summary>Write the consideration boxes</summary>
      {BOXES.map((b) => {
        const e = mine[b.id];
        const pick = (choice: Choice) =>
          setConsideration(studentId, b.id, { choice, text: e?.text ?? "" });
        return (
          <fieldset key={b.id}>
            <legend>{b.label}</legend>
            <label className="check">
              <input
                type="radio"
                name={`cons-${b.id}`}
                checked={e?.choice === "not_needed"}
                onChange={() => pick("not_needed")}
              />
              Considered, not needed
            </label>
            <label className="check">
              <input
                type="radio"
                name={`cons-${b.id}`}
                checked={e?.choice === "needed"}
                onChange={() => pick("needed")}
              />
              Needed
            </label>
            {e && (
              <label>
                {e.choice === "needed" ? "What the team decided" : "Reason (optional)"}
                <textarea
                  rows={2}
                  value={e.text}
                  onChange={(ev) =>
                    setConsideration(studentId, b.id, {
                      choice: e.choice,
                      text: clip(ev.target.value, 2000),
                    })
                  }
                />
              </label>
            )}
            {e?.choice === "not_needed" && <p className="meta">Starts with: {NOT_NEEDED}</p>}
          </fieldset>
        );
      })}
    </details>
  );
}
