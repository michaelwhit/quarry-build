import { useRef, useState } from "react";
import { clip } from "../data/codePoints.ts";
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
import {
  addMyAccommodation,
  duplicateMyAccommodation,
  isMyAccommodationId,
  removeMyAccommodation,
  renameMyAccommodation,
  useMyAccommodations,
} from "../data/myAccommodations.ts";
import { duplicateMyGoal, removeMyGoal, renameMyGoal, useMyGoals } from "../data/myItems.ts";
import { can, getRole } from "../data/roles.ts";
import { addAccommodation, addGoal, getWorkspace, removeAccommodation } from "../data/workspace.ts";
import { AccommodationBulk } from "./AccommodationBulk.tsx";
import { DeleteButton } from "./Forms.tsx";
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
  const [status, setStatus] = useState("");
  const [startHref, setStartHref] = useState("");
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const mine = useMyGoals();
  const allGoals = [...goals, ...mine];
  const mineAccs = useMyAccommodations();
  const allAccs = [...accommodations, ...mineAccs];

  const starSet = tab === "goals" ? stars.goals : stars.accommodations;
  const mineSet = new Set((tab === "goals" ? mine : mineAccs).map((x) => x.id));
  const only = mineOnly ? mineSet : starsOnly ? starSet : undefined;
  const shownGoals = filterGoals(allGoals, { query, band, area, only });
  const shownAccs = filterAccommodations(allAccs, { query, kind, category, only });
  const filtering =
    (tab === "goals" ? !!(query || band || area) : !!(query || kind || category)) ||
    starsOnly ||
    mineOnly;
  const toggleStar = (id: string, title: string) => {
    const next: Favorites =
      tab === "goals"
        ? { ...stars, goals: toggled(stars.goals, id) }
        : { ...stars, accommodations: toggled(stars.accommodations, id) };
    setStars(next);
    const on = (tab === "goals" ? next.goals : next.accommodations).has(id);
    setStatus(
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
    setMineOnly(false);
    setStatus("");
    setStartHref("");
    // The button that was pressed goes away, so keyboard focus moves to the search box.
    searchRef.current?.focus();
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
      const goalId = addGoal(forId, q.input);
      setStatus(`Added "${g.title}" to ${facts.name}'s goals.`);
      setStartHref(`#/track/${forId}/${goalId}`);
    } catch (err) {
      setStartHref("");
      setStatus(err instanceof Error ? err.message : "Could not add the goal");
    }
  };
  const openGoal = tab === "goals" ? allGoals.find((g) => g.id === openId) : undefined;
  const openAcc = tab === "accommodations" ? allAccs.find((a) => a.id === openId) : undefined;

  return (
    <>
      <h2 className="page-title">Libraries</h2>
      <p className="lib-sample" role="note">
        Sample wording made up for practice. It has not been reviewed by a specialist.
      </p>
      <div className="lib-tabs" role="group" aria-label="Library">
        {(["goals", "accommodations"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setPicked(new Set());
              setOpenId(null);
              setStatus("");
              setStartHref("");
            }}
          >
            {t === "goals" ? "Goals" : "Accommodations"}
          </button>
        ))}
      </div>
      <div className="lib-filters" role="search" aria-label="Search and filter the library">
        <input
          ref={searchRef}
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
              setStatus("");
              setStartHref("");
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
          disabled={mineOnly}
          aria-describedby={mineOnly ? "lib-fav-hint" : undefined}
          onChange={(e) => setStarsOnly(e.target.checked)}
        />
        Favorites only ({starSet.size})
      </label>
      {mineOnly && (
        <p id="lib-fav-hint" className="meta">
          Turn off My items only to use Favorites only.
        </p>
      )}
      <label className="check lib-starsonly">
        <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
        My items only ({mineSet.size})
      </label>
      <p className="lib-note" role="status">
        {status}
        {startHref ? (
          <>
            {" "}
            <a href={startHref}>Start collecting data</a>
          </>
        ) : null}
      </p>
      <p className="lib-count" role="status">
        {tab === "goals"
          ? `${shownGoals.length} of ${allGoals.length} goals`
          : `${shownAccs.length} of ${allAccs.length} accommodations`}
        {filtering && (
          <>
            {" "}
            <button type="button" className="link" onClick={clear}>
              Clear search and filters
            </button>
          </>
        )}
      </p>
      {tab === "accommodations" && canAdd && (
        <AccommodationBulk
          picked={allAccs.filter((a) => picked.has(a.id))}
          onDone={() => setPicked(new Set())}
        />
      )}
      {tab === "goals" ? (
        <ul className="lib-list" aria-label="Goals">
          {shownGoals.map((g) => (
            <li key={g.id} className="lib-item">
              {!g.id.startsWith("my-") && (
                <button
                  type="button"
                  className="lib-star"
                  aria-pressed={stars.goals.has(g.id)}
                  aria-label={`Favorite: ${g.title}`}
                  onClick={() => toggleStar(g.id, g.title)}
                >
                  {stars.goals.has(g.id) ? "★" : "☆"}
                </button>
              )}
              <button type="button" aria-current={openId === g.id} onClick={() => setOpenId(g.id)}>
                <strong>{g.title}</strong>
                <span className="meta">
                  {g.id.startsWith("my-") ? "My item · " : ""}
                  {goalAreaLabel[g.area]}
                  {g.grade_bands.length > 0 ? ` · Grades ${g.grade_bands.join(", ")}` : ""}
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
              {mineOnly && !query && !band && !area
                ? 'Nothing in My items yet. When you add a goal, tick "Also add this wording to my goal library".'
                : starsOnly && !query && !band && !area
                  ? "No favorites yet. Tap a star to save a goal."
                  : "No goals match."}
            </li>
          )}
        </ul>
      ) : (
        <ul className="lib-list" aria-label="Accommodations">
          {shownAccs.map((a) => (
            <li key={a.id} className="lib-item">
              {!isMyAccommodationId(a.id) && (
                <button
                  type="button"
                  className="lib-star"
                  aria-pressed={stars.accommodations.has(a.id)}
                  aria-label={`Favorite: ${a.title}`}
                  onClick={() => toggleStar(a.id, a.title)}
                >
                  {stars.accommodations.has(a.id) ? "★" : "☆"}
                </button>
              )}
              <button type="button" aria-current={openId === a.id} onClick={() => setOpenId(a.id)}>
                <strong>{a.title}</strong>
                <span className="meta">
                  {isMyAccommodationId(a.id) ? "My item · " : ""}
                  {kindLabel[a.kind]} · {a.category}
                </span>
              </button>
              {canAdd && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={picked.has(a.id)}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(a.id);
                        else next.delete(a.id);
                        return next;
                      })
                    }
                  />{" "}
                  Tick to add with others
                  <span className="sr-only">: {a.title}</span>
                </label>
              )}
            </li>
          ))}
          {shownAccs.length === 0 && (
            <li className="empty">
              {mineOnly && !query && !kind && !category
                ? 'Nothing in My items yet. Open an accommodation, change the wording if you like, and choose "Save to My items".'
                : starsOnly && !query && !kind && !category
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
      {openGoal?.id.startsWith("my-") && (
        <MineTools
          key={`tools:${openGoal.id}`}
          title={openGoal.title}
          rename={(t) => renameMyGoal(openGoal.id, t)}
          copy={() => {
            const res = duplicateMyGoal(openGoal.id);
            if (res.ok) {
              setOpenId(res.id);
              setStatus(`Saved a copy of "${openGoal.title}" and opened it.`);
            }
            return res;
          }}
        />
      )}
      {openGoal?.id.startsWith("my-") && (
        <DeleteButton
          label="Remove from My items"
          ask="Yes, remove it from My items"
          onDelete={() => {
            removeMyGoal(openGoal.id);
            setOpenId(null);
            setStatus(`Removed "${openGoal.title}" from My items.`);
          }}
        />
      )}
      {openAcc && (
        <AccommodationDetail
          key={openAcc.id}
          item={openAcc}
          onCopied={(id) => {
            setOpenId(id);
            setStatus(`Saved a copy of "${openAcc.title}" and opened it.`);
          }}
          onRemoved={(title) => {
            setOpenId(null);
            setStatus(`Removed "${title}" from My items.`);
          }}
        />
      )}
    </>
  );
}

/** Rename a saved item or make a copy of it to change; the copy opens so it can be reworded. */
function MineTools({
  title,
  rename,
  copy,
}: {
  title: string;
  rename: (title: string) => boolean;
  copy: () => { ok: true; kept: boolean } | { ok: false; reason: "full" | "duplicate" | "invalid" };
}) {
  const [name, setName] = useState(title);
  const [message, setMessage] = useState("");
  const hint = !name.trim()
    ? "Type a name to turn Rename on."
    : name.trim() === title
      ? "Change the name to turn Rename on."
      : "";
  return (
    <div className="lib-detail" role="group" aria-label="Your saved item">
      <label>
        <span>Name in My items</span>
        <input value={name} onChange={(e) => setName(clip(e.target.value, 120))} />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={hint !== ""}
          aria-describedby={hint ? "mine-name-hint" : undefined}
          onClick={() =>
            setMessage(
              rename(name) ? `Renamed to "${name.trim()}".` : "Could not rename. Check the name.",
            )
          }
        >
          Rename
        </button>
        <button
          type="button"
          onClick={() => {
            const res = copy();
            setMessage(
              res.ok
                ? ""
                : res.reason === "full"
                  ? "My items is full. Remove one first."
                  : "Could not make a copy.",
            );
          }}
        >
          Make a copy
        </button>
      </div>
      {hint && (
        <p id="mine-name-hint" className="meta">
          {hint}
        </p>
      )}
      <p className="saved" role="status">
        {message}
      </p>
    </div>
  );
}

function AccommodationDetail({
  item,
  onRemoved,
  onCopied,
}: {
  item: AccommodationItem;
  onRemoved: (title: string) => void;
  onCopied: (id: string) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [where, setWhere] = useState(item.location);
  const [often, setOften] = useState(item.frequency);
  const [length, setLength] = useState(item.duration);
  const role = getRole();
  const vague = vagueFrequency(often);
  const blank = !where.trim() || !often.trim() || !length.trim();
  const student = students.find((s) => s.student.id === studentId)?.student;
  const mineItem = isMyAccommodationId(item.id);
  const saveMine = () => {
    const res = addMyAccommodation({
      title: item.title,
      kind: item.kind,
      category: item.category,
      description: item.description,
      location: where,
      frequency: often,
      duration: length,
    });
    setMessage(
      res.ok
        ? res.kept
          ? `Saved "${item.title}" to My items.`
          : `Saved "${item.title}" for now; this browser would not keep it for later visits.`
        : res.reason === "full"
          ? "My items is full. Remove one first."
          : res.reason === "duplicate"
            ? "That wording is already in My items."
            : "Could not save that wording. Check the boxes and try again.",
    );
  };
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
        <strong>Location:</strong> {item.location}
        <br />
        <strong>Frequency:</strong> {item.frequency}
        <br />
        <strong>Duration:</strong> {item.duration}
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
            <span>Location</span>
            <input value={where} onChange={(e) => setWhere(clip(e.target.value, 200))} />
          </label>
          <label>
            <span>Frequency</span>
            <input value={often} onChange={(e) => setOften(clip(e.target.value, 200))} />
          </label>
          <label>
            <span>Duration</span>
            <input value={length} onChange={(e) => setLength(clip(e.target.value, 200))} />
          </label>
          {vague && (
            <p id="acc-add-vague" className="form-error" role="alert">
              "As needed" is not allowed. Say how many times and how often.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="save"
              onClick={add}
              disabled={!student || vague || blank}
              aria-describedby={
                !student
                  ? "acc-add-pick"
                  : vague
                    ? "acc-add-vague"
                    : blank
                      ? "acc-add-blank"
                      : undefined
              }
            >
              Add to student
            </button>
            {!mineItem && (
              <button
                type="button"
                onClick={saveMine}
                disabled={vague || blank}
                aria-describedby={vague ? "acc-add-vague" : blank ? "acc-add-blank" : undefined}
              >
                Save to My items
              </button>
            )}
          </div>
          {!student && (
            <p id="acc-add-pick" className="meta">
              {students.length === 0
                ? "Add a made-up student on the caseload page first."
                : "Choose a student above to turn this on."}
            </p>
          )}
          {!vague && blank && (
            <p id="acc-add-blank" className="meta">
              Fill in location, frequency and duration to turn this on.
            </p>
          )}
          <p className="saved" role="status">
            {message}
          </p>
        </form>
      )}
      {mineItem && (
        <MineTools
          title={item.title}
          rename={(t) => renameMyAccommodation(item.id, t)}
          copy={() => {
            const res = duplicateMyAccommodation(item.id);
            if (res.ok) onCopied(res.id);
            return res;
          }}
        />
      )}
      {mineItem && (
        <DeleteButton
          label="Remove from My items"
          ask="Yes, remove it from My items"
          onDelete={() => {
            removeMyAccommodation(item.id);
            onRemoved(item.title);
          }}
        />
      )}
    </section>
  );
}

/** The accommodations on a student's page, with a way to remove one. */
export function StudentAccommodations({ studentId }: { studentId: string }) {
  const role = getRole();
  const list = getWorkspace().accommodations.filter((a) => a.student_id === studentId);
  const [removed, setRemoved] = useState("");
  return (
    <section className="lib-detail" aria-label="Accommodations">
      <h3>Accommodations</h3>
      <p role="status" className="sr-only">
        {removed}
      </p>
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
            <strong>Location:</strong> {a.location}
            <br />
            <strong>Frequency:</strong> {a.frequency}
            <br />
            <strong>Duration:</strong> {a.duration}
          </p>
          {role && can(role, "editGoal") && (
            <button
              type="button"
              className="danger-ghost"
              onClick={() => {
                removeAccommodation(a.id);
                setRemoved(`Removed ${a.title}.`);
              }}
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
      setMessage(`Added to ${studentName}'s goals.`);
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
                maxLength={s.kind === "date" ? 10 : undefined}
                onChange={(e) =>
                  set(s.name, s.kind === "date" ? e.target.value : clip(e.target.value, 100))
                }
              />
            )}
            {s.help && <span>{s.help}</span>}
          </label>
        ))}
        <label>
          <span>Baseline for this student (optional)</span>
          <input value={baseline} onChange={(e) => setBaseline(clip(e.target.value, 200))} />
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
