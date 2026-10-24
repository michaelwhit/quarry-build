import { scrub, studentById } from "./district.ts";
import { getWorkspace } from "./workspace.ts";

// A student's most recent session notes, newest first (practice data only). Notes are the free
// text a collector typed with a data point. Read only; each note is shown without the student's
// last name, and only for goals the signed-in role can see.

export interface RecentNote {
  id: string;
  /** ISO time the session was observed. */
  at: string;
  /** "Goal 2", counted in the student's goal order. */
  goalLabel: string;
  setting: string;
  text: string;
}

export const RECENT_NOTE_LIMIT = 5;

export function recentNotes(studentId: string, limit = RECENT_NOTE_LIMIT): RecentNote[] {
  const view = studentById(studentId);
  if (!view) return [];
  const label = new Map(view.goals.map((g, i) => [g.goal.id, `Goal ${i + 1}`]));
  return getWorkspace()
    .points.flatMap((p) => {
      const goalLabel = label.get(p.goal_id);
      const text = scrub(p.note ?? "", view.student).trim();
      return goalLabel && text
        ? [{ id: p.id, at: p.observed_at, goalLabel, setting: p.setting, text }]
        : [];
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
