import { type GoalForTemplate, draftMyGoal, todayIso } from "../data/myItemsFromGoal.ts";

/**
 * The "Add to my goal library" offer on the goal form: tick it, name it, and see what the saved
 * wording still lacks. The goal is saved to My items (in Libraries) when the form is saved.
 */
export function MyItemsOffer({
  goal,
  on,
  onToggle,
  onTitle,
}: {
  goal: GoalForTemplate;
  on: boolean;
  onToggle: (on: boolean) => void;
  onTitle: (title: string) => void;
}) {
  const draft = on ? draftMyGoal(goal, todayIso()) : null;
  return (
    <div className="my-offer">
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        Also add this wording to my goal library
      </label>
      {on && draft && (
        <>
          <label>
            <span>Name in My items</span>
            <input
              value={goal.title}
              maxLength={120}
              placeholder="e.g. Read a passage aloud"
              onChange={(e) => onTitle(e.target.value)}
            />
          </label>
          <p className="meta">
            The student's name becomes a blank, so you can use it for another student. Find it under
            Libraries, Goals, My items only.
          </p>
          {draft.notes.length === 0 ? (
            <p className="meta">This wording passes the library's measurability checks.</p>
          ) : (
            <>
              <p className="meta">It still needs, to read as measurable:</p>
              <ul className="meta">
                {draft.notes.map((c) => (
                  <li key={c.id}>{c.fix ?? c.label}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
