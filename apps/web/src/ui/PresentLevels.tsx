import { useState, useSyncExternalStore } from "react";
import { clip } from "../data/codePoints.ts";
import { localDay } from "../data/localDay.ts";
import { displayName, studentById, students } from "../data/district.ts";
import { getRole, getRoleVersion, roleById, subscribeRole } from "../data/roles.ts";
import {
  AREAS,
  type Area,
  type EvScore,
  type EvStatement,
  SCORE_KINDS,
  SLOTS,
  SOURCES,
  type Source,
  type StatedBy,
  approveSlot,
  blankScore,
  blankStatement,
  checkSlot,
  confirmEvidence,
  draftSlot,
  getPl,
  getPlVersion,
  mockDrafter,
  removeEvidence,
  reopenSlot,
  requiredContent,
  saveScore,
  saveStatement,
  scoreProblems,
  setSlotText,
  slotEvidence,
  statementProblems,
  subscribePl,
  type ScoreKind,
} from "../data/presentLevels.ts";

// Directors, case managers and related-service providers draft present levels. The practice app has
// no per-student case manager assignment, so every case manager can open it.
export const canUsePresentLevels = (role: string | null) =>
  role === "sped_director" || role === "case_manager" || role === "related_service_provider";

const today = () => localDay();
const areaLabel = (a: Area) => AREAS.find((x) => x.id === a)?.label ?? a;

/** Every name that must not reach the drafter: the practice students on this roster. */
const rosterNames = (): string[] =>
  students.flatMap(({ student: s }) =>
    [s.first_name, s.last_name, s.preferred_name ?? "", `${s.first_name} ${s.last_name}`].filter(
      (n) => n !== "",
    ),
  );

function ScoreForm({
  initial,
  onDone,
  studentId,
  who,
}: {
  initial: EvScore;
  onDone: () => void;
  studentId: string;
  who: string;
}) {
  const [s, setS] = useState(initial);
  const set = (p: Partial<EvScore>) => setS((c) => ({ ...c, ...p }));
  const problems = scoreProblems(s, today());
  return (
    <div className="form">
      <fieldset className="score-row">
        <legend>{initial.measure ? "Edit score" : "Add a score"}</legend>
        <label>
          <span>Section</span>
          <select
            autoFocus
            value={s.source}
            onChange={(e) => set({ source: e.target.value as Source })}
          >
            {SOURCES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Area</span>
          <select value={s.area} onChange={(e) => set({ area: e.target.value as Area })}>
            {AREAS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Test or instrument (for example Acadience ORF)</span>
          <input
            value={s.instrument}
            onChange={(e) => set({ instrument: clip(e.target.value, 120) })}
          />
        </label>
        <label>
          <span>Measure (for example Reading Fluency)</span>
          <input value={s.measure} onChange={(e) => set({ measure: clip(e.target.value, 120) })} />
        </label>
        <label>
          <span>Score type</span>
          <select value={s.kind} onChange={(e) => set({ kind: e.target.value as ScoreKind })}>
            {SCORE_KINDS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Score, as printed</span>
          <input
            value={s.value}
            inputMode="decimal"
            maxLength={20}
            onChange={(e) => set({ value: e.target.value })}
          />
        </label>
        <label>
          <span>Percentile (optional, 1 to 99)</span>
          <input
            value={s.percentile}
            inputMode="numeric"
            maxLength={3}
            onChange={(e) => set({ percentile: e.target.value })}
          />
        </label>
        <label>
          <span>
            Label printed in the report (optional, copied exactly, for example Below Average)
          </span>
          <input
            value={s.descriptor}
            onChange={(e) => set({ descriptor: clip(e.target.value, 60) })}
          />
        </label>
        <label>
          <span>Date given (year-month-day)</span>
          <input
            value={s.testedOn}
            placeholder="2026-09-15"
            maxLength={10}
            onChange={(e) => set({ testedOn: e.target.value })}
          />
        </label>
        <div aria-live="polite">
          {problems.map((p) => (
            <p className="form-error" key={p}>
              {p}
            </p>
          ))}
        </div>
        <div className="actions stack">
          <button
            type="button"
            className="save"
            disabled={problems.length > 0}
            onClick={() => {
              const ctx = { who };
              saveScore(getPl(studentId), s, ctx);
              confirmEvidence(getPl(studentId), s.id, ctx, today());
              onDone();
            }}
          >
            This matches the report
          </button>
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function StatementForm({
  initial,
  scores,
  onDone,
  studentId,
  who,
}: {
  initial: EvStatement;
  scores: EvScore[];
  onDone: () => void;
  studentId: string;
  who: string;
}) {
  const [s, setS] = useState(initial);
  const set = (p: Partial<EvStatement>) => setS((c) => ({ ...c, ...p }));
  const problems = statementProblems(s);
  return (
    <div className="form">
      <fieldset className="score-row">
        <legend>{initial.text ? "Edit statement" : "Add a need or strength"}</legend>
        <label>
          <span>Kind</span>
          <select
            autoFocus
            value={s.kind}
            onChange={(e) => set({ kind: e.target.value as "strength" | "need" })}
          >
            <option value="need">Need (what the student cannot yet do)</option>
            <option value="strength">Strength (what the student can do)</option>
          </select>
        </label>
        <label>
          <span>Who stated it</span>
          <select
            value={s.statedBy}
            onChange={(e) => set({ statedBy: e.target.value as StatedBy })}
          >
            <option value="teacher">Teacher</option>
            <option value="evaluator">Evaluator</option>
            <option value="mdt">Team (MDT)</option>
          </select>
        </label>
        <label>
          <span>Area</span>
          <select value={s.area} onChange={(e) => set({ area: e.target.value as Area })}>
            {AREAS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>In your words, one sentence (do not type real names or details)</span>
          <textarea
            value={s.text}
            rows={2}
            onChange={(e) => set({ text: clip(e.target.value, 400) })}
          />
        </label>
        <label>
          <span>Effect on learning in class (optional)</span>
          <textarea
            value={s.implication}
            rows={2}
            onChange={(e) => set({ implication: clip(e.target.value, 400) })}
          />
        </label>
        {scores.length > 0 && (
          <fieldset>
            <legend>Scores that support it (optional)</legend>
            {scores.map((sc) => (
              <label className="check" key={sc.id}>
                <input
                  type="checkbox"
                  checked={s.scoreIds.includes(sc.id)}
                  onChange={(e) =>
                    set({
                      scoreIds: e.target.checked
                        ? [...s.scoreIds, sc.id]
                        : s.scoreIds.filter((i) => i !== sc.id),
                    })
                  }
                />
                {sc.measure} ({sc.value})
              </label>
            ))}
          </fieldset>
        )}
        <div aria-live="polite">
          {problems.map((p) => (
            <p className="form-error" key={p}>
              {p}
            </p>
          ))}
        </div>
        <div className="actions stack">
          <button
            type="button"
            className="save"
            disabled={problems.length > 0}
            onClick={() => {
              const ctx = { who };
              saveStatement(getPl(studentId), s, ctx);
              confirmEvidence(getPl(studentId), s.id, ctx, today());
              onDone();
            }}
          >
            This matches the report
          </button>
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        </div>
      </fieldset>
    </div>
  );
}

export function PresentLevels({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribePl, getPlVersion, getPlVersion);
  useSyncExternalStore(subscribeRole, getRoleVersion, getRoleVersion);
  const [form, setForm] = useState<{ score?: EvScore; statement?: EvStatement } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  // Said aloud to screen-reader users; the buttons that cause these changes disappear or change.
  const [said, setSaid] = useState("");
  const role = getRole();
  const s = studentById(studentId);
  if (!canUsePresentLevels(role))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">
          Sign in as the director, a case manager or a related-service provider to draft present
          levels.
        </p>
      </>
    );
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  const rec = getPl(studentId);
  const who = roleById(role)?.person ?? "Staff";
  const ctx = { who };
  const first = s.student.preferred_name ?? s.student.first_name;
  const confirmedScores = rec.scores.filter((x) => x.state === "confirmed");
  const draftOne = async (key: string) => {
    const out = await draftSlot(getPl(studentId), key, first, rosterNames(), mockDrafter, ctx);
    setNotes((n) => ({ ...n, [key]: out }));
    setSaid(`${SLOTS.find((x) => x.key === key)?.label ?? "Section"}: draft saved`);
  };
  const draftAll = async () => {
    setBusy(true);
    try {
      for (const slot of SLOTS) if (slot.ai) await draftOne(slot.key);
    } finally {
      setBusy(false);
    }
  };
  const reqs = requiredContent(rec);
  // A closed form or a removed row would drop keyboard focus to the top of the page.
  const focusEvidence = () =>
    queueMicrotask(() => document.getElementById("pl-evidence")?.focus({ preventScroll: true }));
  const closeForm = () => {
    setForm(null);
    focusEvidence();
  };
  const removeAndSay = (id: string, text: string) => {
    removeEvidence(getPl(studentId), id, ctx);
    setSaid(text);
    focusEvidence();
  };

  return (
    <>
      <a className="btn back" href={`#/student/${studentId}`}>
        ← {displayName(s.student)}
      </a>
      <h2 className="page-title">Present levels</h2>
      <p className="sr-only" role="status">
        {said}
      </p>
      <p className="form-warn" role="note">
        Practice only. Do not type real names or details. Use made-up text.
      </p>
      <p className="meta">
        Draft only. You confirm the evidence, edit the words and approve each section. Numbers and
        report labels are copied from the scores you confirmed, never written by the drafter. This
        practice build uses a simple offline drafter and sends nothing anywhere.
      </p>

      <section className="card" aria-labelledby="pl-evidence">
        <h3 className="sec" id="pl-evidence" tabIndex={-1}>
          1. Evidence you confirm
        </h3>
        <p className="meta">
          Only confirmed scores and statements are used. Type each one as it appears in the report.
        </p>
        {rec.scores.length === 0 && rec.statements.length === 0 && (
          <p className="empty">Nothing yet.</p>
        )}
        <ul className="eval-preview">
          {rec.scores.map((x) => (
            <li key={x.id}>
              <span className="meta">
                {areaLabel(x.area)} · {SOURCES.find((o) => o.id === x.source)?.label}
              </span>
              <span>
                {x.measure}
                {x.instrument ? ` (${x.instrument})` : ""}:{" "}
                {SCORE_KINDS.find((k) => k.id === x.kind)?.label.toLowerCase()} {x.value}
                {x.percentile ? `, percentile ${x.percentile}` : ""}
                {x.descriptor ? `, "${x.descriptor}"` : ""}, {x.testedOn}
              </span>
              {x.state === "draft" && <span className="form-error">Not confirmed yet.</span>}
              {(x.kind === "ageEquivalent" || x.kind === "gradeEquivalent") && (
                <span className="meta">Kept on file. Not used in drafts.</span>
              )}
              <span>
                <button
                  type="button"
                  aria-label={`Edit score: ${x.measure}`}
                  onClick={() => setForm({ score: x })}
                >
                  Edit
                </button>{" "}
                <button
                  type="button"
                  aria-label={`Remove score: ${x.measure}`}
                  onClick={() => removeAndSay(x.id, `Removed score: ${x.measure}`)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {rec.statements.map((x) => (
            <li key={x.id}>
              <span className="meta">
                {x.kind === "need" ? "Need" : "Strength"} · {areaLabel(x.area)} · stated by{" "}
                {x.statedBy === "mdt" ? "the team" : x.statedBy}
              </span>
              <span>{x.text}</span>
              {x.state === "draft" && <span className="form-error">Not confirmed yet.</span>}
              <span>
                <button
                  type="button"
                  aria-label={`Edit ${x.kind === "need" ? "need" : "strength"}: ${x.text}`}
                  onClick={() => setForm({ statement: x })}
                >
                  Edit
                </button>{" "}
                <button
                  type="button"
                  aria-label={`Remove ${x.kind === "need" ? "need" : "strength"}: ${x.text}`}
                  onClick={() =>
                    removeAndSay(x.id, `Removed ${x.kind === "need" ? "need" : "strength"}`)
                  }
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        {form?.score ? (
          <ScoreForm
            key={form.score.id}
            initial={form.score}
            studentId={studentId}
            who={who}
            onDone={closeForm}
          />
        ) : form?.statement ? (
          <StatementForm
            key={form.statement.id}
            initial={form.statement}
            scores={confirmedScores}
            studentId={studentId}
            who={who}
            onDone={closeForm}
          />
        ) : (
          <div className="actions stack">
            <button
              type="button"
              className="add-score"
              onClick={() => setForm({ score: blankScore(rec) })}
            >
              + Add a score
            </button>
            <button
              type="button"
              className="add-score"
              onClick={() => setForm({ statement: blankStatement(rec) })}
            >
              + Add a need or strength
            </button>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="pl-required">
        <h3 className="sec" id="pl-required">
          Required content
        </h3>
        <ul>
          {reqs.map((r) => (
            <li key={r.id}>
              {r.met ? "Covered" : "Still missing"}: {r.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="pl-draft">
        <h3 className="sec" id="pl-draft">
          2. Draft and edit
        </h3>
        <div className="actions stack">
          <button type="button" className="save" disabled={busy} onClick={() => void draftAll()}>
            {busy ? "Drafting…" : "Draft the sections"}
          </button>
        </div>
        {SLOTS.map((def) => {
          const slot = rec.slots[def.key];
          const ev = slotEvidence(rec, def.key);
          const problems = checkSlot(def.key, slot, rec, today());
          const red = problems.some((p) => p.severity === "red");
          const empty = def.ai && ev.scores.length === 0 && ev.statements.length === 0;
          return (
            <section className="goal" key={def.key} aria-label={def.label} aria-busy={busy}>
              <h3 className="as-written">{def.label}</h3>
              <p className="meta">
                {def.ai ? "Draft, you approve." : "You write this section."} ·{" "}
                {slot?.approved ? "Approved" : slot ? "Draft saved" : "Not started"}
              </p>
              {empty && !slot && (
                <p className="empty">No confirmed evidence for this section yet.</p>
              )}
              <div className="form">
                <textarea
                  aria-label={def.label}
                  value={slot?.text ?? ""}
                  rows={def.ai ? 6 : 4}
                  disabled={slot?.approved}
                  onChange={(e) =>
                    setSlotText(getPl(studentId), def.key, clip(e.target.value, 6000), ctx)
                  }
                />
              </div>
              {slot && def.ai && !slot.edited && (
                <p className="meta">
                  Each sentence comes from a confirmed row:{" "}
                  {slot.sentences.filter((x) => x.cites.length > 0).length} of{" "}
                  {slot.sentences.length} have a source.
                </p>
              )}
              {(notes[def.key] ?? []).map((n) => (
                <p className="form-error" key={n}>
                  {n}
                </p>
              ))}
              {problems.map((p, i) => (
                <p key={`${i}-${p.text}`} className={p.severity === "red" ? "form-error" : "meta"}>
                  {p.severity === "red" ? "Fix: " : p.severity === "amber" ? "Check: " : ""}
                  {p.text}
                </p>
              ))}
              <div className="actions stack">
                {def.ai && !slot?.approved && (
                  <button
                    type="button"
                    disabled={busy || empty}
                    onClick={() => void draftOne(def.key)}
                  >
                    {slot ? "Draft again" : "Draft this section"}
                  </button>
                )}
                {slot?.approved ? (
                  <button
                    type="button"
                    onClick={() => {
                      reopenSlot(getPl(studentId), def.key, ctx);
                      setSaid(`${def.label}: open for editing`);
                    }}
                  >
                    Edit again
                  </button>
                ) : (
                  <button
                    type="button"
                    className="save"
                    disabled={!slot || slot.text.trim() === "" || red}
                    onClick={() => {
                      approveSlot(getPl(studentId), def.key, ctx, today());
                      setSaid(`${def.label}: approved`);
                    }}
                  >
                    Approve this section
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </section>

      <section className="card" aria-labelledby="pl-log">
        <h3 className="sec" id="pl-log">
          History
        </h3>
        {rec.log.length === 0 ? (
          <p className="empty">Nothing yet.</p>
        ) : (
          <ul>
            {rec.log
              .slice(-20)
              .reverse()
              .map((l, i) => (
                <li key={`${l.at}-${i}`}>
                  {l.at.slice(0, 16).replace("T", " ")} · {l.who} · {l.text}
                </li>
              ))}
          </ul>
        )}
        <p className="meta">
          The state record system stays the official record. Copy approved text there yourself.
        </p>
      </section>
    </>
  );
}
