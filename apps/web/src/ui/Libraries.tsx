import { useState } from "react";
import { students, displayName } from "../data/district.ts";
import {
  type AccommodationItem,
  GRADE_BANDS,
  type GoalItem,
  accommodations,
  goalAreaLabel,
  goals,
  kindLabel,
  searchText,
} from "../data/library.ts";
import {
  checks,
  formSlots,
  initialValues,
  isReady,
  masteryLine,
  pieces,
  preview,
  renderedText,
} from "../data/libraryText.ts";
import { addGoal } from "../data/workspace.ts";
import "./libraries.css";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Tab = "goals" | "accommodations";

/** Browse the sample goal and accommodation libraries, fill a goal in, and add it to a student. */
export function Libraries() {
  const [tab, setTab] = useState<Tab>("goals");
  const [query, setQuery] = useState("");
  const [band, setBand] = useState("");
  const [area, setArea] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shownGoals = goals.filter(
    (g) =>
      (!band || g.grade_bands.includes(band as never)) &&
      (!area || g.area === area) &&
      (!q || searchText(g.title, `${g.template_text} ${goalAreaLabel[g.area]}`).includes(q)),
  );
  const shownAccs = accommodations.filter(
    (a) => !q || searchText(a.title, `${a.description} ${a.category}`).includes(q),
  );
  const openGoal = tab === "goals" ? goals.find((g) => g.id === openId) : undefined;
  const openAcc =
    tab === "accommodations" ? accommodations.find((a) => a.id === openId) : undefined;

  return (
    <>
      <h2 className="page-title">Libraries</h2>
      <p className="lib-sample" role="note">
        Sample wording made up for practice. It has not been reviewed by a specialist.
      </p>
      <div className="lib-tabs">
        {(["goals", "accommodations"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setOpenId(null);
            }}
          >
            {t === "goals" ? "Goals" : "Accommodations"}
          </button>
        ))}
      </div>
      <div className="lib-filters">
        <input
          type="search"
          aria-label="Search the library"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {tab === "goals" && (
          <>
            <select aria-label="Grade band" value={band} onChange={(e) => setBand(e.target.value)}>
              <option value="">All grades</option>
              {GRADE_BANDS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            <select aria-label="Goal area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">All areas</option>
              {Object.entries(goalAreaLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {tab === "goals" ? (
        <ul className="lib-list" aria-label="Goals">
          {shownGoals.map((g) => (
            <li key={g.id}>
              <button type="button" aria-current={openId === g.id} onClick={() => setOpenId(g.id)}>
                <strong>{g.title}</strong>
                <span className="meta">
                  {goalAreaLabel[g.area]} · Grades {g.grade_bands.join(", ")}
                </span>
                <span className="meta">{preview(g.template_text)}</span>
              </button>
            </li>
          ))}
          {shownGoals.length === 0 && <li className="empty">No goals match.</li>}
        </ul>
      ) : (
        <ul className="lib-list" aria-label="Accommodations">
          {shownAccs.map((a) => (
            <li key={a.id}>
              <button type="button" aria-current={openId === a.id} onClick={() => setOpenId(a.id)}>
                <strong>{a.title}</strong>
                <span className="meta">
                  {kindLabel[a.kind]} · {a.category}
                </span>
              </button>
            </li>
          ))}
          {shownAccs.length === 0 && <li className="empty">No accommodations match.</li>}
        </ul>
      )}
      {openGoal && <GoalDetail key={openGoal.id} goal={openGoal} />}
      {openAcc && <AccommodationDetail item={openAcc} />}
    </>
  );
}

function AccommodationDetail({ item }: { item: AccommodationItem }) {
  return (
    <section className="lib-detail" aria-label={item.title}>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <p className="meta">
        {kindLabel[item.kind]} · {item.category}
      </p>
      <p>
        <strong>Where:</strong> {item.location}
        <br />
        <strong>How often:</strong> {item.frequency}
        <br />
        <strong>For how long:</strong> {item.duration}
      </p>
      <p className="meta">Adding accommodations to a student is not on the web practice app yet.</p>
    </section>
  );
}

function GoalDetail({ goal }: { goal: GoalItem }) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(goal));
  const [studentId, setStudentId] = useState("");
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("");
  const student = students.find((s) => s.student.id === studentId)?.student;
  const studentName = student ? displayName(student) : null;
  const today = todayIso();
  const slots = formSlots(goal);
  const list = checks(goal, values, today);
  const ready = isReady(goal, values, today);

  const set = (name: string, v: string) => {
    setValues({ ...values, [name]: v });
    setMessage("");
  };

  const add = () => {
    if (!student || !ready) return;
    try {
      const targetValue =
        goal.target_value === "from_slot"
          ? Number(values[goal.target_slot ?? ""] ?? "")
          : goal.target_value;
      addGoal(student.id, {
        area: goal.area,
        statement: renderedText(goal, values, studentName),
        baseline,
        criteria: masteryLine(goal.mastery),
        type: goal.type,
        unit: goal.unit,
        targetValue,
        trialsPerSession: goal.trials_per_session,
        promptHierarchy: goal.prompt_hierarchy,
        taskSteps: goal.task_steps,
        frequency: "2x weekly",
      });
      setMessage(`Added to ${studentName}.`);
      window.location.hash = `#/student/${student.id}`;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add the goal");
    }
  };

  return (
    <section className="lib-detail" aria-label={goal.title}>
      <h3>{goal.title}</h3>
      <p aria-label="Goal wording">
        {pieces(goal, values, studentName).map((p, i) =>
          p.kind === "text" ? (
            <span key={i}>{p.text}</span>
          ) : p.kind === "filled" ? (
            <span key={i} className="lib-filled">
              {p.text}
            </span>
          ) : (
            <span key={i} className="lib-blank">
              [{p.slot.replaceAll("_", " ")}]
            </span>
          ),
        )}
      </p>
      <p className="meta">How it is met: {masteryLine(goal.mastery)}</p>
      <p className="meta">Baseline tip: {goal.baseline_guidance}</p>
      <form className="form" onSubmit={(e) => e.preventDefault()}>
        {slots.map((s) => (
          <label key={s.name}>
            <span>{s.name.replaceAll("_", " ")}</span>
            {s.kind === "choice" ? (
              <select value={values[s.name] ?? ""} onChange={(e) => set(s.name, e.target.value)}>
                <option value="">Choose</option>
                {(s.choices ?? []).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            ) : (
              <input
                type={s.kind === "date" ? "date" : "text"}
                inputMode={s.kind === "number" ? "decimal" : undefined}
                value={values[s.name] ?? ""}
                maxLength={s.kind === "date" ? 10 : 100}
                onChange={(e) => set(s.name, e.target.value)}
              />
            )}
            {s.help && <span>{s.help}</span>}
          </label>
        ))}
        <label>
          <span>Baseline for this student (optional)</span>
          <input value={baseline} maxLength={200} onChange={(e) => setBaseline(e.target.value)} />
        </label>
        <label>
          <span>Add to student</span>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Choose a student</option>
            {students.map((s) => (
              <option key={s.student.id} value={s.student.id}>
                {displayName(s.student)}
              </option>
            ))}
          </select>
        </label>
      </form>
      <ul className="lib-checks" aria-label="Checks">
        {list.map((c) => (
          <li key={c.id}>
            <span aria-hidden="true">{c.pass ? "✓" : "✗"}</span> {c.label}
            {!c.pass && c.fix && <span className="meta"> — {c.fix}</span>}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="save" onClick={add} disabled={!ready || !student}>
          Add to student's goals
        </button>
      </div>
      {students.length === 0 && (
        <p className="meta">Add a made-up student on the caseload page first.</p>
      )}
      <p className="saved" role="status">
        {message}
      </p>
    </section>
  );
}
