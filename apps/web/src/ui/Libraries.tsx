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
} from "../data/library.ts";
import { loadFavorites, saveFavorites, toggled, type Favorites } from "../data/libraryFavorites.ts";
import { factsFor, fillFrom, fitsGrade, goalInput, oneTap } from "../data/libraryFill.ts";
import { categoriesOf, filterAccommodations, filterGoals } from "../data/libraryFilter.ts";
import {
  checks,
  vagueFrequency,
  formSlots,
  initialValues,
  isReady,
  masteryLine,
  pieces,
  preview,
} from "../data/libraryText.ts";
import { can, getRole } from "../data/roles.ts";
import { addAccommodation, addGoal, getWorkspace, removeAccommodation } from "../data/workspace.ts";
import "./libraries.css";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Tab = "goals" | "accommodations";

/** Browse the sample goal and accommodation libraries, fill a goal in, and add it to a student. */
export function Libraries({ start = "goals" }: { start?: Tab }) {
  const [tab, setTab] = useState<Tab>(start);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState("");
  const [area, setArea] = useState("");
  const [forId, setForId] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("");
  const [category, setCategory] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [stars, setStars] = useState<Favorites>(() =>
    loadFavorites(
      goals.map((g) => g.id),
      accommodations.map((a) => a.id),
    ),
  );
  const [starsOnly, setStarsOnly] = useState(false);
  const [starNote, setStarNote] = useState("");

  const starSet = tab === "goals" ? stars.goals : stars.accommodations;
  const only = starsOnly ? starSet : undefined;
  const shownGoals = filterGoals(goals, { query, band, area, only });
  const shownAccs = filterAccommodations(accommodations, { query, kind, category, only });
  const filtering =
    (tab === "goals" ? !!(query || band || area) : !!(query || kind || category)) || starsOnly;
  const toggleStar = (id: string, title: string) => {
    const next: Favorites =
      tab === "goals"
        ? { ...stars, goals: toggled(stars.goals, id) }
        : { ...stars, accommodations: toggled(stars.accommodations, id) };
    setStars(next);
    setNote("");
    const on = (tab === "goals" ? next.goals : next.accommodations).has(id);
    setStarNote(
      saveFavorites(next)
        ? `${on ? "Saved" : "Removed"} "${title}" ${on ? "to" : "from"} your favorites.`
        : `Could not keep "${title}" in your favorites; this browser would not save it.`,
    );
  };
  const clear = () => {
    setQuery("");
    setBand("");
    setArea("");
    setKind("");
    setCategory("");
    setStarsOnly(false);
  };
  const role = getRole();
  const canAdd = !!role && can(role, "editGoal");
  const facts = forId ? factsFor(forId) : null;
  const today = todayIso();
  const have = new Set(
    (students.find((s) => s.student.id === forId)?.goals ?? []).map((g) => g.goal.statement),
  );
  const quick = (g: GoalItem) => {
    if (!facts) return null;
    const values = fillFrom(g, facts, today);
    const input = oneTap(g, values, today) ? goalInput(g, values, facts.name) : null;
    return input && !have.has(input.statement.trim()) ? { values, input } : null;
  };
  const addQuick = (g: GoalItem) => {
    const q = quick(g);
    if (!q || !facts) return;
    try {
      addGoal(forId, q.input);
      setNote(`Added "${g.title}" to ${facts.name}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not add the goal");
    }
  };
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
        {tab === "accommodations" && (
          <>
            <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(kindLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categoriesOf(accommodations).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </>
        )}
      </div>
      {tab === "goals" && canAdd && students.length > 0 && (
        <div className="lib-filters">
          <select
            aria-label="Draft for a student"
            value={forId}
            onChange={(e) => {
              setForId(e.target.value);
              setNote("");
            }}
          >
            <option value="">Draft for a student (optional)</option>
            {students.map((s) => (
              <option key={s.student.id} value={s.student.id}>
                {displayName(s.student)}
              </option>
            ))}
          </select>
        </div>
      )}
      {tab === "goals" && facts && (
        <p className="meta">
          Grade {facts.grade || "unknown"}. Goals marked "One tap" need nothing more than the plan
          year's end date from {facts.name}'s record.
        </p>
      )}
      <label className="check lib-starsonly">
        <input
          type="checkbox"
          checked={starsOnly}
          onChange={(e) => setStarsOnly(e.target.checked)}
        />
        Favorites only ({starSet.size})
      </label>
      <p className="lib-note" role="status">
        {note || starNote}
      </p>
      <p className="lib-count" role="status">
        {tab === "goals"
          ? `${shownGoals.length} of ${goals.length} goals`
          : `${shownAccs.length} of ${accommodations.length} accommodations`}
        {filtering && (
          <>
            {" "}
            <button type="button" className="link" onClick={clear}>
              Clear search and filters
            </button>
          </>
        )}
      </p>
      {tab === "goals" ? (
        <ul className="lib-list" aria-label="Goals">
          {shownGoals.map((g) => (
            <li key={g.id} className="lib-item">
              <button
                type="button"
                className="lib-star"
                aria-pressed={stars.goals.has(g.id)}
                aria-label={`Favorite: ${g.title}`}
                onClick={() => toggleStar(g.id, g.title)}
              >
                {stars.goals.has(g.id) ? "★" : "☆"}
              </button>
              <button type="button" aria-current={openId === g.id} onClick={() => setOpenId(g.id)}>
                <strong>{g.title}</strong>
                <span className="meta">
                  {goalAreaLabel[g.area]} · Grades {g.grade_bands.join(", ")}
                </span>
                <span className="meta">{preview(g.template_text)}</span>
                {facts && fitsGrade(g, facts.grade) === false && (
                  <span className="meta">Written for other grades</span>
                )}
              </button>
              {facts && canAdd && quick(g) && (
                <button type="button" className="save" onClick={() => addQuick(g)}>
                  One tap: add to {facts.name}
                </button>
              )}
            </li>
          ))}
          {shownGoals.length === 0 && (
            <li className="empty">
              {starsOnly && !query && !band && !area
                ? "No favorites yet. Tap a star to save a goal."
                : "No goals match."}
            </li>
          )}
        </ul>
      ) : (
        <ul className="lib-list" aria-label="Accommodations">
          {shownAccs.map((a) => (
            <li key={a.id} className="lib-item">
              <button
                type="button"
                className="lib-star"
                aria-pressed={stars.accommodations.has(a.id)}
                aria-label={`Favorite: ${a.title}`}
                onClick={() => toggleStar(a.id, a.title)}
              >
                {stars.accommodations.has(a.id) ? "★" : "☆"}
              </button>
              <button type="button" aria-current={openId === a.id} onClick={() => setOpenId(a.id)}>
                <strong>{a.title}</strong>
                <span className="meta">
                  {kindLabel[a.kind]} · {a.category}
                </span>
              </button>
            </li>
          ))}
          {shownAccs.length === 0 && (
            <li className="empty">
              {starsOnly && !query && !kind && !category
                ? "No favorites yet. Tap a star to save an accommodation."
                : "No accommodations match."}
            </li>
          )}
        </ul>
      )}
      {openGoal && (
        <GoalDetail
          key={`${openGoal.id}:${forId}`}
          goal={openGoal}
          forStudentId={forId}
          onOpenAccommodation={(id) => {
            setTab("accommodations");
            setQuery("");
            setOpenId(id);
          }}
        />
      )}
      {openAcc && <AccommodationDetail key={openAcc.id} item={openAcc} />}
    </>
  );
}

function AccommodationDetail({ item }: { item: AccommodationItem }) {
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [where, setWhere] = useState(item.location);
  const [often, setOften] = useState(item.frequency);
  const [length, setLength] = useState(item.duration);
  const role = getRole();
  const vague = vagueFrequency(often);
  const blank = !where.trim() || !often.trim() || !length.trim();
  const student = students.find((s) => s.student.id === studentId)?.student;
  const add = () => {
    if (!student) return;
    try {
      addAccommodation(student.id, {
        title: item.title,
        kind: item.kind,
        description: item.description,
        location: where.trim(),
        frequency: often.trim(),
        duration: length.trim(),
      });
      setMessage(`Added to ${displayName(student)}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add the accommodation");
    }
  };
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
      {role && can(role, "editGoal") && (
        <form className="form" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>Add to student</span>
            <select
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
          </label>
          <label>
            <span>Where</span>
            <input value={where} maxLength={200} onChange={(e) => setWhere(e.target.value)} />
          </label>
          <label>
            <span>How often</span>
            <input value={often} maxLength={200} onChange={(e) => setOften(e.target.value)} />
          </label>
          <label>
            <span>For how long</span>
            <input value={length} maxLength={200} onChange={(e) => setLength(e.target.value)} />
          </label>
          {vague && (
            <p className="form-error" role="alert">
              "As needed" is not allowed. Say how many times and how often.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="save"
              onClick={add}
              disabled={!student || vague || blank}
            >
              Add to student
            </button>
          </div>
          <p className="saved" role="status">
            {message}
          </p>
        </form>
      )}
    </section>
  );
}

/** The accommodations on a student's page, with a way to remove one. */
export function StudentAccommodations({ studentId }: { studentId: string }) {
  const role = getRole();
  const list = getWorkspace().accommodations.filter((a) => a.student_id === studentId);
  return (
    <section className="lib-detail" aria-label="Accommodations">
      <h3>Accommodations</h3>
      {list.length === 0 && (
        <p className="empty">
          None yet. Add one from the <a href="#/libraries">Libraries</a> tab.
        </p>
      )}
      {list.map((a) => (
        <div key={a.id}>
          <strong>{a.title}</strong>
          <p>{a.description}</p>
          <p className="meta">
            {a.location} · {a.frequency} · {a.duration}
          </p>
          {role && can(role, "editGoal") && (
            <button
              type="button"
              className="danger-ghost"
              onClick={() => removeAccommodation(a.id)}
            >
              Remove {a.title}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function GoalDetail({
  goal,
  forStudentId,
  onOpenAccommodation,
}: {
  goal: GoalItem;
  forStudentId: string;
  onOpenAccommodation: (id: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const f = forStudentId ? factsFor(forStudentId) : null;
    return f ? fillFrom(goal, f, todayIso()) : initialValues(goal);
  });
  const [studentId, setStudentId] = useState(forStudentId);
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("");
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const role = getRole();
  const mayAdd = !!role && can(role, "editGoal");
  const student = students.find((s) => s.student.id === studentId)?.student;
  const studentName = student ? displayName(student) : null;
  const today = todayIso();
  const slots = formSlots(goal);
  const list = checks(goal, values, today);
  const ready = isReady(goal, values, today) && (!goal.requires_fba_bip || planConfirmed);

  const set = (name: string, v: string) => {
    setValues({ ...values, [name]: v });
    setMessage("");
  };

  const add = () => {
    if (!student || !ready || !mayAdd) return;
    try {
      addGoal(student.id, goalInput(goal, values, studentName, baseline));
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
      <p className="meta">How it is met: {masteryLine(goal.mastery, values)}</p>
      <p className="meta">Baseline tip: {goal.baseline_guidance}</p>
      {goal.objective_ladder.length > 0 && (
        <div>
          <strong>Steps toward the goal</strong>
          <ol>
            {goal.objective_ladder.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
        </div>
      )}
      {goal.related_accommodation_ids.length > 0 && (
        <div>
          <strong>Often goes with</strong>
          <div className="actions">
            {goal.related_accommodation_ids.map((id) => {
              const a = accommodations.find((x) => x.id === id);
              return a ? (
                <button key={id} type="button" onClick={() => onOpenAccommodation(id)}>
                  {a.title}
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
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
        {goal.requires_fba_bip && (
          <label className="check">
            <input
              type="checkbox"
              checked={planConfirmed}
              onChange={(e) => setPlanConfirmed(e.target.checked)}
            />
            This wording is about a behavior. I have confirmed the student has a current behavior
            assessment and behavior plan that it matches.
          </label>
        )}
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
        <button
          type="button"
          className="save"
          onClick={add}
          disabled={!ready || !student || !mayAdd}
        >
          Add to student's goals
        </button>
      </div>
      {!mayAdd && <p className="meta">Your role can read the library but not add goals.</p>}
      {students.length === 0 && (
        <p className="meta">Add a made-up student on the caseload page first.</p>
      )}
      <p className="saved" role="status">
        {message}
      </p>
    </section>
  );
}
