import { useEffect, useMemo, useState } from "react";
import { students } from "../data/district.ts";
import {
  homeLine,
  overdueList,
  recordListLoad,
  setPracticeDate,
  viewDate,
} from "../data/overdue.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 26" from "2026-10-26", read from the text so no time zone can move the day. */
export const dueWords = (iso: string): string => {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1] ?? ""} ${day}`.trim();
};

/** The one due date every waiting report shares, or undefined when they differ (or none wait). */
export const sharedDueDate = (dates: string[]): string | undefined =>
  dates.length > 0 && dates.every((d) => d === dates[0]) ? dates[0] : undefined;

/** These lists come from the built-in demo district, so with no students loaded they match nothing. */
export function SampleListNote() {
  if (students.length > 0) return null;
  return (
    <p className="meta" data-testid="sample-list-note">
      These reports are samples from the demo district. They will not match your caseload until you{" "}
      <a href="#/">load the sample students</a>.
    </p>
  );
}

/** The director's Home line; opens the list. Zero is shown calmly, not hidden. */
export function OverdueHomeLine() {
  const n = overdueList(viewDate()).total;
  return (
    <a className="card numbers" href="#/due" aria-label="Open what is due">
      <div className="name">{homeLine(viewDate())}</div>
      <div className="meta">
        {n === 0 ? "Everything due so far is filed." : "Tap to see what is due and who to ask."}
      </div>
    </a>
  );
}

/** Which progress reports are not filed yet, and who to ask. Read only; no export or send. */
export function Overdue() {
  const [date, setDate] = useState(viewDate());
  const all = useMemo(() => overdueList(date), [date]);
  const [picked, setPicked] = useState<string | null>(null);
  const period = all.periods.some((p) => p.id === picked) ? picked : (all.periods[0]?.id ?? null);
  const list = useMemo(() => overdueList(date, period ?? undefined), [date, period]);
  useEffect(() => {
    recordListLoad(list);
  }, [list]);
  const label = all.periods.find((p) => p.id === period)?.label;
  const due = sharedDueDate(
    list.buildings.flatMap((b) => b.managers.flatMap((m) => m.reports.map((r) => r.dueDate))),
  );
  return (
    <>
      <a className="btn" href="#/">
        ← Home
      </a>
      <h2 className="page-title">Progress reports to file</h2>
      <p className="meta">Made-up reports for practice. These are not real students.</p>
      <SampleListNote />
      {list.total === 0 ? (
        <p className="empty">Nothing is waiting. Every progress report due so far is filed.</p>
      ) : (
        <p className="name">
          {list.total} waiting past their due date
          {label ? ` · ${label} report${due ? `, due ${dueWords(due)}` : ""}` : ""}
        </p>
      )}
      <div className="card">
        {all.periods.length > 1 && (
          <label>
            Period{" "}
            <select value={period ?? ""} onChange={(e) => setPicked(e.target.value)}>
              {all.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Practice date{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              setPracticeDate(e.target.value);
              setDate(e.target.value);
            }}
          />
        </label>
        <p className="meta">Change the date to see how the list looks on another day.</p>
      </div>
      {list.buildings.map((b) => (
        <section key={b.building}>
          <h3 className="sec">{b.building}</h3>
          {b.managers.map((m) => (
            <details key={m.caseManager} className="card">
              <summary>
                <strong>{m.caseManager}</strong>{" "}
                <span className="meta">
                  {m.reports.length} report{m.reports.length === 1 ? "" : "s"}
                </span>
              </summary>
              <ul className="pick">
                {m.reports.map((r) => (
                  <li key={r.id}>
                    {students.some((s) => s.student.id === r.studentId) ? (
                      <a href={`#/student/${encodeURIComponent(r.studentId)}`}>
                        <strong>{r.student}</strong>
                      </a>
                    ) : (
                      <strong>{r.student}</strong>
                    )}
                    <span className="meta">
                      {" "}
                      Grade {r.grade} · {r.periodLabel} · due {dueWords(r.dueDate)} · {r.words}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="meta">Ask the case manager: {m.caseManager}.</p>
            </details>
          ))}
        </section>
      ))}
    </>
  );
}
