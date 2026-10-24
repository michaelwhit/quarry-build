import { useSyncExternalStore } from "react";
import { dateWithYear } from "../data/dates.ts";
import { recentNotes } from "../data/recentNotes.ts";
import { getVersion, subscribe } from "../data/workspace.ts";

const day = dateWithYear;

/** The last few session notes for a student, newest first. */
export function RecentNotes({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const notes = recentNotes(studentId);
  return (
    <section className="goal" aria-label="Recent notes">
      <h3>Recent notes</h3>
      {notes.length === 0 ? (
        <p className="empty">No session notes yet.</p>
      ) : (
        <ul>
          {notes.map((n) => (
            <li key={n.id}>
              <strong>{day(n.at)}</strong> · {n.goalLabel}
              {n.setting ? ` · ${n.setting}` : ""}
              <br />
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
