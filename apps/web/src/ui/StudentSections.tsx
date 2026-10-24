import { displayName, studentById } from "../data/district.ts";
import { can, getRole } from "../data/roles.ts";
import { StudentAccommodations } from "./Libraries.tsx";

export type Section = "goals" | "accommodations" | "present-levels" | "services" | "behavior";

export const SECTIONS: { id: Section; label: string }[] = [
  { id: "goals", label: "Goals" },
  { id: "accommodations", label: "Accommodations / modifications" },
  { id: "present-levels", label: "Present levels" },
  { id: "services", label: "Services" },
  { id: "behavior", label: "Behavior" },
];

const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));
export const isSection = (x: string | undefined): x is Section => !!x && SECTION_IDS.has(x);

const href = (studentId: string, s: Section) =>
  s === "goals" ? `#/student/${studentId}` : `#/student/${studentId}/${s}`;

/** The buttons under the student's name. "IEP for SRS" is not here on purpose: it is a secondary view. */
export function StudentNav({ studentId, active }: { studentId: string; active: Section }) {
  const role = getRole();
  return (
    <nav className="student-nav" aria-label="Student sections">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          className={s.id === active ? "btn on" : "btn"}
          href={href(studentId, s.id)}
          aria-current={s.id === active ? "page" : undefined}
        >
          {s.label}
        </a>
      ))}
      {can(role, "editStudent") && (
        <a className="btn" href={`#/student/${studentId}/edit`}>
          Edit student
        </a>
      )}
    </nav>
  );
}

/** Behavior: nothing is stored yet, and the BIP upload stays off until the security review. */
export function Behavior() {
  return (
    <>
      <p className="empty">No behavior plan yet.</p>
      <p>
        <button type="button" disabled aria-describedby="bip-note">
          Upload a BIP
        </button>
      </p>
      <p id="bip-note" className="empty">
        Uploading a behavior intervention plan is not turned on. It is a real student document, so
        it waits for the security review. Practice data only for now.
      </p>
    </>
  );
}

/** The two sections that live on this screen; Goals, Present levels and Services have their own. */
export function StudentSection({
  id,
  section,
}: {
  id: string;
  section: "accommodations" | "behavior";
}) {
  const s = studentById(id);
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  return (
    <>
      <a className="btn back" href="#/">
        ← Caseload
      </a>
      <h2 style={{ textTransform: "none", color: "var(--text)", fontSize: "1.4rem" }}>
        {displayName(s.student)}
      </h2>
      <StudentNav studentId={s.student.id} active={section} />
      {section === "behavior" ? (
        <>
          <h3>Behavior</h3>
          <Behavior />
        </>
      ) : (
        <StudentAccommodations studentId={s.student.id} />
      )}
    </>
  );
}
