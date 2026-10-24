import { useEffect, useRef, useState } from "react";
import { goalLabel } from "../data/derive.ts";
import { displayName, goalById, students } from "../data/district.ts";
import {
  type SessionState,
  emptySession,
  hasInput,
  inputKind,
  sessionValue,
} from "../data/session.ts";
import { addPoint, deletePoint, getWorkspace } from "../data/workspace.ts";
import { can, getRole } from "../data/roles.ts";
import { DeleteButton } from "./Forms.tsx";
import { Chip } from "./Chip.tsx";
import { GoalPanel } from "./GoalPanel.tsx";
import { Graph } from "./Graph.tsx";
import { count, gradeWords, metaLine } from "../data/wording.ts";
import { checkOutlier, outlierQuestion } from "../data/outlier.ts";

export function TrackPicker() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const s = students.find((x) => x.student.id === studentId);
  return (
    <>
      <h2 style={{ textTransform: "none", color: "var(--text)", fontSize: "1.4rem" }}>
        {s ? `${displayName(s.student)}: pick a goal` : "Who are you working with?"}
      </h2>
      {s ? (
        <>
          <button type="button" className="back" onClick={() => setStudentId(null)}>
            ← Students
          </button>
          {s.goals.length === 0 && <p className="empty">No goals yet for this student.</p>}
          <ul className="pick">
            {s.goals.map((g) => (
              <li key={g.goal.id}>
                <a className="pick-btn" href={`#/track/${s.student.id}/${g.goal.id}`}>
                  <strong style={{ textTransform: "capitalize" }}>{goalLabel(g.goal)}</strong>
                  <span>{g.goal.statement}</span>
                  <span className="meta">{count(g.series.length, "data point")}</span>
                </a>
              </li>
            ))}
          </ul>
          {can(getRole(), "editGoal") && (
            <a className="btn" href={`#/student/${s.student.id}/add-goal`}>
              Add a goal
            </a>
          )}
        </>
      ) : students.length === 0 ? (
        <p>
          No students yet.{" "}
          {can(getRole(), "addStudent") && (
            <>
              <a href="#/add-student">Add a student</a> first.
            </>
          )}
        </p>
      ) : (
        <ul className="pick">
          {students.map((x) => (
            <li key={x.student.id}>
              <button type="button" className="pick-btn" onClick={() => setStudentId(x.student.id)}>
                <strong>{displayName(x.student)}</strong>
                <span className="meta">
                  {metaLine(gradeWords(x.student.grade), count(x.goals.length, "goal"))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function fmtTime(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function TrackGoal({ studentId, goalId }: { studentId: string; goalId: string }) {
  const hit = goalById(studentId, goalId);
  const plan = hit?.g.plan;
  const [s, setS] = useState<SessionState | null>(() => (plan ? emptySession(plan) : null));
  const [history, setHistory] = useState<SessionState[]>([]);
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState("");
  const [asking, setAsking] = useState("");
  const tick = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!running) return;
    tick.current = window.setInterval(
      () => setS((x) => x && { ...x, seconds: x.seconds + 1 }),
      1000,
    );
    return () => window.clearInterval(tick.current);
  }, [running]);

  if (!hit || !plan || !s)
    return (
      <p>
        Goal not found. <a href="#/track">Back</a>
      </p>
    );
  const { s: student, g } = hit;
  const kind = inputKind(plan);

  const change = (next: SessionState) => {
    setAsking("");
    setHistory((h) => [...h, s]);
    setS(next);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setAsking("");
    setHistory((h) => h.slice(0, -1));
    setS(prev);
  };

  const series = g.series;
  const progress = g.progress;
  const value = sessionValue(plan, s);
  const unit = plan.unit ?? plan.type.replaceAll("_", " ");

  const save = (confirmed = false) => {
    if (value === null) return;
    if (!confirmed) {
      const check = checkOutlier(
        series.map((p) => p.value),
        value,
        plan.target_value,
      );
      if (check.ask) {
        setAsking(outlierQuestion(value, unit, check));
        return;
      }
    }
    setAsking("");
    addPoint(goalId, value, note);
    setS(emptySession(plan));
    setHistory([]);
    setNote("");
    setRunning(false);
    setFlash(`Saved ${value} ${unit}`);
    window.setTimeout(() => setFlash(""), 3000);
  };

  return (
    <>
      <a className="btn back" href="#/track">
        ← Change goal
      </a>
      <h2
        style={{
          textTransform: "none",
          color: "var(--text)",
          fontSize: "1.25rem",
          margin: "8px 0 2px",
        }}
      >
        {displayName(student.student)} ·{" "}
        <span style={{ textTransform: "capitalize" }}>{goalLabel(g.goal)}</span>
      </h2>
      <GoalPanel goal={g.goal} plan={plan} capHeight />

      <section className="pad" aria-label="Record data">
        {kind === "trials" && (
          <>
            <div className="big-grid">
              <button
                type="button"
                className="big yes"
                onClick={() => change({ ...s, correct: s.correct + 1 })}
              >
                <span aria-hidden="true">✓</span> Correct
              </button>
              <button
                type="button"
                className="big no"
                onClick={() => change({ ...s, incorrect: s.incorrect + 1 })}
              >
                <span aria-hidden="true">✗</span> Incorrect
              </button>
            </div>
            <p className="readout" aria-live="polite">
              {s.correct} of {s.correct + s.incorrect} correct
              {plan.trials_per_session ? ` · session size ${plan.trials_per_session}` : ""}
            </p>
          </>
        )}
        {kind === "tally" && (
          <>
            <button
              type="button"
              className="big yes wide"
              onClick={() => change({ ...s, count: s.count + 1 })}
            >
              + 1
            </button>
            <p className="readout" aria-live="polite">
              {s.count} so far
            </p>
          </>
        )}
        {kind === "timer" && (
          <>
            <button
              type="button"
              className={`big wide ${running ? "no" : "yes"}`}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? "Stop" : s.seconds > 0 ? "Resume" : "Start"} timer
            </button>
            <p className="readout" aria-live="off">
              {fmtTime(s.seconds)}
            </p>
          </>
        )}
        {kind === "level" && (
          <div className="levels" role="radiogroup" aria-label="Prompt level">
            {plan.prompt_hierarchy.map((name, i) => (
              <button
                type="button"
                key={name}
                role="radio"
                aria-checked={s.level === i + 1}
                className={`big level ${s.level === i + 1 ? "on" : ""}`}
                onClick={() => change({ ...s, level: i + 1 })}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {kind === "rubric" && (
          <div className="big-grid" role="radiogroup" aria-label="Rubric score">
            {Array.from({ length: plan.target_value + 1 }, (_, i) => i).map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={s.level === n}
                className={`big level ${s.level === n ? "on" : ""}`}
                onClick={() => change({ ...s, level: n })}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        {kind === "steps" && (
          <ul className="steps">
            {plan.task_steps.map((name, i) => (
              <li key={name}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={s.steps[i] === true}
                  className={`big level ${s.steps[i] ? "on" : ""}`}
                  onClick={() => change({ ...s, steps: s.steps.map((v, j) => (j === i ? !v : v)) })}
                >
                  {s.steps[i] ? "✓ " : ""}
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {kind === "yesno" && (
          <div className="big-grid">
            <button type="button" className="big yes" onClick={() => change({ ...s, yes: true })}>
              Yes
            </button>
            <button type="button" className="big no" onClick={() => change({ ...s, yes: false })}>
              No
            </button>
          </div>
        )}

        <label className="note">
          <span>Quick note (optional)</span>
          <input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. used visual cue"
          />
        </label>
        <div className="actions">
          <button type="button" onClick={undo} disabled={history.length === 0}>
            Undo
          </button>
          <button
            type="button"
            className="save"
            onClick={() => save()}
            disabled={!hasInput(plan, s)}
          >
            Save session{value !== null ? `: ${value} ${unit}` : ""}
          </button>
        </div>
        {asking && (
          <div role="alert">
            <p>{asking}</p>
            <div className="actions">
              <button type="button" className="save" onClick={() => save(true)}>
                Yes, save it
              </button>
              <button type="button" onClick={() => setAsking("")}>
                No, let me change it
              </button>
            </div>
          </div>
        )}
        <p className="saved" role="status">
          {flash}
        </p>
      </section>

      <section className="goal" aria-label="Progress">
        <div className="row">
          <h3>Progress</h3>
          <Chip status={progress.status} />
        </div>
        <Graph
          series={series}
          target={plan.target_value}
          label={`${goalLabel(g.goal)} goal`}
          unit={unit}
        />
      </section>
      {can(getRole(), "history") && <History goalId={goalId} unit={unit} />}
      <p style={{ color: "var(--text-muted)", fontSize: ".8rem" }}>
        Practice mode: made-up data only. Sessions you save stay in this browser; clear them on the
        More tab.
      </p>
    </>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Every saved session for the goal, newest first, each removable if it was a mistake. */
function History({ goalId, unit }: { goalId: string; unit: string }) {
  const rows = getWorkspace()
    .points.filter((p) => p.goal_id === goalId)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  return (
    <section className="goal" aria-label="History">
      <h3>History</h3>
      {rows.length === 0 ? (
        <p className="empty">No sessions saved yet.</p>
      ) : (
        <ul className="history">
          {rows.map((p) => (
            <li key={p.id}>
              <div>
                <strong>
                  {p.value_num ?? p.correct ?? "–"} {unit}
                </strong>
                <span className="meta"> · {when(p.observed_at)}</span>
                {p.note && <div className="meta">{p.note}</div>}
              </div>
              <DeleteButton
                label="Remove"
                ask="Yes, remove this session"
                onDelete={() => deletePoint(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
