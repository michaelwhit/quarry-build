import { displayName, studentById, students } from "../data/district.ts";

const words = (t: string) => t.replaceAll("_", " ");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A general-education teacher's list: only the students with goals shared with them. */
export function MyStudents() {
  return (
    <>
      <h2 className="page-title">My students</h2>
      {students.length === 0 ? (
        <p className="empty">
          No students are assigned to you yet. Your case manager assigns students here.
        </p>
      ) : (
        <ul className="pick">
          {[...students]
            .sort((a, b) => displayName(a.student).localeCompare(displayName(b.student)))
            .map((s) => (
              <li key={s.student.id}>
                <a className="pick-btn" href={`#/glance/${encodeURIComponent(s.student.id)}`}>
                  <strong>{displayName(s.student)}</strong>
                  <span className="meta">
                    {s.student.grade ? `Grade ${s.student.grade} · ` : ""}
                    {s.goals.length} goal{s.goals.length === 1 ? "" : "s"}
                  </span>
                  <span aria-hidden="true" className="chev">
                    ›
                  </span>
                </a>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}

/** One student, read only: the whole goals, then what is not built yet. No data, no controls. */
export function AtAGlance({ studentId }: { studentId: string }) {
  const s = studentById(studentId);
  if (!s)
    return (
      <>
        <h2 className="page-title">My students</h2>
        <p className="empty">This student is no longer shared with you.</p>
        <a className="btn" href="#/today">
          ← My students
        </a>
      </>
    );
  return (
    <>
      <a className="btn" href="#/today">
        ← My students
      </a>
      <h2 className="page-title">{displayName(s.student)}</h2>
      <p className="meta">
        {s.student.grade ? `Grade ${s.student.grade}. ` : ""}Read only. Ask the case manager if
        something looks wrong.
      </p>
      <h3 className="sec">Goals</h3>
      <ul className="pick">
        {s.goals.map((g) => (
          <li key={g.goal.id} className="card">
            <strong>{cap(words(g.goal.area))}</strong>
            <p>{g.goal.statement}</p>
            <p className="meta">
              Measured by: {words(g.plan.type)}. Target: {g.goal.target}
            </p>
          </li>
        ))}
      </ul>
      <h3 className="sec">Accommodations and modifications</h3>
      <div className="card planned-card">
        <span className="planned-tag">Planned</span>
        <p>Accommodations and modifications are not on the web yet.</p>
      </div>
      <h3 className="sec">Services</h3>
      <div className="card planned-card">
        <span className="planned-tag">Planned</span>
        <p>Services and minutes are not on the web yet.</p>
      </div>
      <p className="meta">Don't share this outside school.</p>
    </>
  );
}
