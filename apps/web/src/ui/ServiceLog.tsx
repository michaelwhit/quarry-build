import { useState, useSyncExternalStore } from "react";
import { displayName, studentById } from "../data/district.ts";
import { viewDate } from "../data/overdue.ts";
import { getRole, getRoleVersion, subscribeRole } from "../data/roles.ts";
import {
  OUTCOMES,
  OUTCOME_LABELS,
  type Outcome,
  summarizeRange,
  weekLine,
} from "../data/serviceLog.ts";
import {
  deleteEntry,
  getServiceLog,
  getServiceLogVersion,
  logEntry,
  setRequiredPerWeek,
  subscribeServiceLog,
} from "../data/serviceLogStore.ts";
import { canUsePresentLevels } from "./PresentLevels.tsx";

export const canUseServiceLog = canUsePresentLevels;

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** The minutes a provider delivered each week against what the IEP calls for, for one student. */
export function ServiceLog({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeServiceLog, getServiceLogVersion, getServiceLogVersion);
  useSyncExternalStore(subscribeRole, getRoleVersion, getRoleVersion);
  const [date, setDate] = useState(viewDate());
  const [minutes, setMinutes] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("delivered");
  const [problem, setProblem] = useState("");
  const s = studentById(studentId);
  if (!canUseServiceLog(getRole()))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">Sign in as the director, a case manager or a provider.</p>
      </>
    );
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  const log = getServiceLog(studentId);
  const weeks = summarizeRange(log.entries, viewDate(), log.requiredPerWeek).reverse();
  const entries = [...log.entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <a className="btn back" href={`#/student/${studentId}`}>
        ← {displayName(s.student)}
      </a>
      <h2 style={{ textTransform: "none", color: "var(--text)", fontSize: "1.4rem" }}>
        Service minutes log
      </h2>
      <p>
        Practice data only. Log what was delivered each day and see the week against the minutes the
        IEP calls for. Nothing leaves this browser.
      </p>
      <label>
        Minutes the IEP calls for each week
        <input
          inputMode="numeric"
          maxLength={4}
          value={log.requiredPerWeek ? String(log.requiredPerWeek) : ""}
          onChange={(e) => setRequiredPerWeek(studentId, Number(e.target.value.replace(/\D/g, "")))}
        />
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const why = logEntry(studentId, { date, minutes: Number(minutes), outcome });
          setProblem(why ?? "");
          if (!why) setMinutes("");
        }}
      >
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          What happened
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minutes
          <input
            inputMode="numeric"
            maxLength={3}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <button type="submit" className="btn">
          Add to log
        </button>
        <p role="status" className="empty">
          {problem}
        </p>
      </form>
      <section className="goal" aria-label="Weeks">
        <h3>Weeks</h3>
        {log.requiredPerWeek === 0 && entries.length > 0 && (
          <p className="empty">Type the weekly minutes above to see what is short.</p>
        )}
        {weeks.length === 0 ? (
          <p className="empty">No entries yet.</p>
        ) : (
          <ul>
            {weeks.map((w) => (
              <li key={w.weekOf}>
                <strong>Week of {day(w.weekOf)}</strong>
                <br />
                {weekLine(w)}
              </li>
            ))}
          </ul>
        )}
      </section>
      {entries.length > 0 && (
        <section className="goal" aria-label="Entries">
          <h3>Entries</h3>
          <ul>
            {entries.map((e) => (
              <li key={e.id}>
                {day(e.date)} · {OUTCOME_LABELS[e.outcome]} · {e.minutes} min{" "}
                <button type="button" className="btn" onClick={() => deleteEntry(studentId, e.id)}>
                  Remove {day(e.date)} entry
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
