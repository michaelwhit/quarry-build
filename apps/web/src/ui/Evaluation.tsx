import { useState } from "react";
import { students } from "../data/district.ts";
import {
  EVALUATION_KINDS,
  type EvaluationKind,
  type Intake,
  SCORE_TYPES,
  type ScoreRow,
  type ScoreType,
  blockers,
  buildPreview,
  emptyIntake,
  fingerprint,
  newRow,
  replacedSummary,
  rowProblems,
} from "../data/evaluation.ts";

/** Every name that must not appear in what would be used: the practice students on this roster. */
const rosterNames = (): string[] =>
  students.flatMap(({ student: s }) =>
    [s.first_name, s.last_name, s.preferred_name ?? "", `${s.first_name} ${s.last_name}`].filter(
      (n) => n !== "",
    ),
  );

/** Type an evaluation's scores and summary, see what would be used, and check it. Nothing is saved or sent. */
export function Evaluation() {
  const [intake, setIntake] = useState<Intake>(emptyIntake);
  const [checked, setChecked] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const preview = buildPreview(intake, rosterNames());
  const problems = blockers(intake, preview);
  const isChecked = checked !== null && checked === fingerprint(intake, preview);
  const set = (patch: Partial<Intake>) => setIntake((cur) => ({ ...cur, ...patch }));
  const setRow = (id: number, patch: Partial<ScoreRow>) =>
    setIntake((cur) => ({
      ...cur,
      rows: cur.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const removeRow = (id: number) =>
    setIntake((cur) => {
      const rows = cur.rows.filter((r) => r.id !== id);
      return { ...cur, rows: rows.length === 0 ? [newRow()] : rows };
    });

  return (
    <>
      <a className="back btn" href="#/">
        ← Home
      </a>
      <h2 className="page-title">Draft from evaluation (Planned)</h2>
      <p role="note">
        Planned feature: this page shows how drafting from an evaluation will work. Nothing here
        replaces the team's own review.
      </p>
      <p className="form-warn" role="note">
        Practice only. Do not type real names or details. Use made-up text.
      </p>
      <div className="form">
        <label>
          <span>Type</span>
          <select
            value={intake.kind}
            onChange={(e) => set({ kind: e.target.value as EvaluationKind })}
          >
            {EVALUATION_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Test or instrument (for example Acadience ORF)</span>
          <input
            value={intake.instrument}
            maxLength={120}
            onChange={(e) => set({ instrument: e.target.value })}
          />
        </label>
        <h3 className="sec">Scores</h3>
        <p className="meta">Type each score as it is printed on the report.</p>
        {intake.rows.map((r, i) => (
          <fieldset className="score-row" key={r.id}>
            <legend>Score {i + 1}</legend>
            <label>
              <span>Measure (for example Reading Fluency)</span>
              <input
                value={r.measure}
                maxLength={120}
                onChange={(e) => setRow(r.id, { measure: e.target.value })}
              />
            </label>
            <label>
              <span>Score type</span>
              <select
                value={r.scoreType}
                onChange={(e) => setRow(r.id, { scoreType: e.target.value as ScoreType })}
              >
                {SCORE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Score</span>
              <input
                value={r.value}
                inputMode="decimal"
                maxLength={20}
                onChange={(e) => setRow(r.id, { value: e.target.value })}
              />
            </label>
            <label>
              <span>Percentile (optional, 1 to 99)</span>
              <input
                value={r.percentile}
                inputMode="numeric"
                maxLength={3}
                onChange={(e) => setRow(r.id, { percentile: e.target.value })}
              />
            </label>
            {rowProblems(r).map((p) => (
              <p className="form-error" key={p}>
                {p}
              </p>
            ))}
            <button type="button" className="remove-score" onClick={() => removeRow(r.id)}>
              Remove score {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="add-score"
          onClick={() => set({ rows: [...intake.rows, newRow()] })}
        >
          + Add a score
        </button>
        <label>
          <span>Evaluator's summary (do not type real names or details)</span>
          <textarea
            value={intake.summary}
            rows={5}
            maxLength={6000}
            onChange={(e) => set({ summary: e.target.value })}
          />
        </label>
        <label>
          <span>Recommendations (do not type real names or details)</span>
          <textarea
            value={intake.recommendations}
            rows={5}
            maxLength={6000}
            onChange={(e) => set({ recommendations: e.target.value })}
          />
        </label>
      </div>

      <section className="card" aria-labelledby="eval-preview">
        <h3 className="sec" id="eval-preview">
          Review what would be sent
        </h3>
        {preview.length === 0 ? (
          <p className="meta">Nothing yet. Add scores or text above.</p>
        ) : (
          <ul className="eval-preview">
            {preview.map((item) => (
              <li key={item.id}>
                <span className="meta">{item.label}</span>
                <span>{item.text}</span>
                {item.withheldReasons.length > 0 ? (
                  <span className="form-error">
                    Held back: looks like {item.withheldReasons.join(", ")}.
                  </span>
                ) : Object.keys(item.replaced).length > 0 ? (
                  <span className="meta">{replacedSummary(item.replaced)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="meta">
          Names, dates and numbers that could identify someone are replaced. Held-back lines are
          never included. Practice build: nothing is sent anywhere.
        </p>
        {problems.map((p, i) => (
          <p className="form-error" key={`${i}-${p}`}>
            {p}
          </p>
        ))}
        <div className="actions stack">
          {isChecked ? (
            <p className="saved" role="status">
              Checked. Drafting from this is not connected yet, so nothing has been sent.
            </p>
          ) : (
            <button
              type="button"
              className="save"
              disabled={problems.length > 0}
              onClick={() => setChecked(fingerprint(intake, preview))}
            >
              Looks right, continue
            </button>
          )}
          {armed ? (
            <>
              <button
                type="button"
                className="save"
                onClick={() => {
                  setIntake(emptyIntake());
                  setChecked(null);
                  setArmed(false);
                }}
              >
                Yes, clear everything
              </button>
              <button type="button" onClick={() => setArmed(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setArmed(true)}>
              Clear everything
            </button>
          )}
        </div>
        <p className="meta">This stays on this screen only. Nothing is saved.</p>
      </section>
    </>
  );
}
