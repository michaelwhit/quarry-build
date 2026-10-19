import { useEffect, useRef, useState } from "react";
import { type SeriesPoint, goalLabel, progressFor } from "../data/derive.ts";
import { displayName, goalById, students } from "../data/district.ts";
import {
  type SessionState,
  emptySession,
  hasInput,
  inputKind,
  sessionValue,
} from "../data/session.ts";
import { Chip } from "./Chip.tsx";
import { GoalPanel } from "./GoalPanel.tsx";
import { Graph } from "./Graph.tsx";

/** Sessions saved this visit. Held in memory only: closing the app forgets them (fake data). */
export type Saved = Record<string, (SeriesPoint & { note: string })[]>;

export function TrackPicker({ saved }: { saved: Saved }) {
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
          <ul className="pick">
            {s.goals.map((g) => (
              <li key={g.goal.id}>
                <a className="pick-btn" href={`#/track/${s.student.id}/${g.goal.id}`}>
                  <strong style={{ textTransform: "capitalize" }}>{goalLabel(g.goal)}</strong>
                  <span>{g.goal.statement}</span>
                  <span className="meta">
                    {g.series.length + (saved[g.goal.id]?.length ?? 0)} data points
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="pick">
          {students.map((x) => (
            <li key={x.student.id}>
              <button type="button" className="pick-btn" onClick={() => setStudentId(x.student.id)}>
                <strong>{displayName(x.student)}</strong>
                <span className="meta">
                  Grade {x.student.grade} · {x.goals.length} goals
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

export function TrackGoal({
  studentId,
  goalId,
  saved,
  onSave,
}: {
  studentId: string;
  goalId: string;
  saved: Saved;
  onSave: (goalId: string, p: SeriesPoint & { note: string }) => void;
}) {
  const hit = goalById(studentId, goalId);
  const plan = hit?.g.plan;
  const [s, setS] = useState<SessionState | null>(() => (plan ? emptySession(plan) : null));
  const [history, setHistory] = useState<SessionState[]>([]);
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState("");
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
    setHistory((h) => [...h, s]);
    setS(next);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setS(prev);
  };

  const extra = saved[goalId] ?? [];
  const series = [...g.series, ...extra].sort((a, b) => a.at.localeCompare(b.at));
  const progress = progressFor(series, plan, g.effectiveFrom, g.effectiveTo);
  const value = sessionValue(plan, s);
  const unit = plan.unit ?? plan.type.replaceAll("_", " ");

  const save = () => {
    if (value === null) return;
    onSave(goalId, { at: new Date().toISOString(), value, note });
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
          <button type="button" className="save" onClick={save} disabled={!hasInput(plan, s)}>
            Save session{value !== null ? `: ${value} ${unit}` : ""}
          </button>
        </div>
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
      <p style={{ color: "var(--text-muted)", fontSize: ".8rem" }}>
        Practice mode: sessions you save here are fake data kept only while this page is open.
      </p>
    </>
  );
}
