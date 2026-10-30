import { useState } from "react";
import { displayName, students } from "../data/district.ts";
import type { AccommodationItem } from "../data/library.ts";
import { bulkMessage, planBulk } from "../data/libraryBulk.ts";
import { addAccommodation, getWorkspace } from "../data/workspace.ts";

/** Add the ticked library accommodations to one student at once. */
export function AccommodationBulk({
  picked,
  onDone,
}: {
  picked: AccommodationItem[];
  onDone: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState("");
  const student = students.find((s) => s.student.id === studentId)?.student;
  const hint =
    students.length === 0
      ? "Add a made-up student on the caseload page first."
      : picked.length === 0
        ? "Tick one or more accommodations in the list to turn this on."
        : !student
          ? "Choose a student to turn this on."
          : "";
  const add = () => {
    if (!student) return;
    const have = getWorkspace()
      .accommodations.filter((a) => a.student_id === student.id)
      .map((a) => a.title);
    const plan = planBulk(picked, have);
    let added = 0;
    for (const a of plan.add) {
      try {
        addAccommodation(student.id, {
          title: a.title,
          kind: a.kind,
          description: a.description,
          location: a.location,
          frequency: a.frequency,
          duration: a.duration,
        });
        added++;
      } catch {
        plan.skip.push(a);
      }
    }
    setMessage(bulkMessage(displayName(student), added, plan.skip.length));
    onDone();
  };
  return (
    <section className="lib-filters" aria-label="Add several to a student">
      <select
        aria-label="Student for the ticked accommodations"
        value={studentId}
        onChange={(e) => {
          setStudentId(e.target.value);
          setMessage("");
        }}
      >
        <option value="">Choose a student</option>
        {students.map((s) => (
          <option key={s.student.id} value={s.student.id}>
            {displayName(s.student)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="save"
        disabled={hint !== ""}
        aria-describedby={hint ? "bulk-hint" : undefined}
        onClick={add}
      >
        {`Add ${picked.length} ticked to ${student ? displayName(student) : "the student"}`}
      </button>
      {hint && (
        <p id="bulk-hint" className="meta">
          {hint}
        </p>
      )}
      <p className="saved" role="status">
        {message}
      </p>
    </section>
  );
}
