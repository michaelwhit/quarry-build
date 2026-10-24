import { displayName, studentById, students } from "../data/district.ts";
import { getServices, kindLabel } from "../data/serviceRows.ts";
import { count, gradeWords, metaLine } from "../data/wording.ts";
import { getWorkspace } from "../data/workspace.ts";

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
                    {metaLine(gradeWords(s.student.grade), count(s.goals.length, "goal"))}
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
  const accommodations = getWorkspace().accommodations.filter((a) => a.student_id === s.student.id);
  const services = getServices(s.student.id).rows;
  return (
    <>
      <a className="btn" href="#/today">
        ← My students
      </a>
      <h2 className="page-title">{displayName(s.student)}</h2>
      <p className="meta">
        {gradeWords(s.student.grade) ? `${gradeWords(s.student.grade)}. ` : ""}Read only. Ask the
        case manager if something looks wrong.
      </p>
      <h3 className="sec">Goals</h3>
      {s.goals.length === 0 && <p className="empty">No goals are shared with you yet.</p>}
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
      {accommodations.length === 0 ? (
        <p className="empty">None recorded yet.</p>
      ) : (
        <ul className="pick">
          {accommodations.map((a) => (
            <li key={a.id} className="card">
              <strong>{a.title}</strong>
              <p>{a.description}</p>
              <p className="meta">{metaLine(a.location, a.frequency, a.duration)}</p>
            </li>
          ))}
        </ul>
      )}
      <h3 className="sec">Services</h3>
      {services.length === 0 ? (
        <p className="empty">None recorded yet.</p>
      ) : (
        <ul className="pick">
          {services.map((r) => (
            <li key={r.id} className="card">
              <strong>{r.title}</strong>
              <p className="meta">{metaLine(kindLabel(r.kind), r.frequency, r.duration)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="meta">Don't share this outside school.</p>
    </>
  );
}

/**
 * A paraprofessional's At a glance is built for the iPhone app only (a gap logged on purpose), so
 * the web says so instead of showing nothing. It names no student and reads no student data.
 */
export function AtAGlanceForParas() {
  return (
    <>
      <h2 className="page-title">At a glance</h2>
      <div className="card planned-card">
        <span className="planned-tag">Planned</span>
        <p>
          At a glance for paraprofessionals is planned for the iPhone app. It is not on the web yet.
          The goals you were given to record are on your Today tab.
        </p>
        <a className="btn" href="#/today">
          ← Today
        </a>
      </div>
    </>
  );
}
