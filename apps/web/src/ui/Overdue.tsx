import { useEffect, useMemo, useState } from "react";
import { students } from "../data/district.ts";
import {
  homeLine,
  overdueList,
  recordListLoad,
  setPracticeDate,
  viewDate,
} from "../data/overdue.ts";

const dueWords = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** The director's Home line; opens the list. Zero is shown calmly, not hidden. */
export function OverdueHomeLine() {
  const n = overdueList(viewDate()).total;
  return (
    <a className="card numbers" href="#/overdue" aria-label="Open the progress reports to file">
      <div className="name">{homeLine(viewDate())}</div>
      <div className="meta">
        {n === 0 ? "Everything due so far is filed." : "Tap to see who to ask."}
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
  const due = list.buildings[0]?.managers[0]?.reports[0]?.dueDate;
  return (
    <>
      <a className="btn" href="#/">
        ← Home
      </a>
      <h2 className="page-title">Progress reports to file</h2>
      <p className="meta">Made-up reports for practice. These are not real students.</p>
      {list.total === 0 ? (
        <p className="empty">Nothing is waiting. Every progress report due so far is filed.</p>
      ) : (
        <p className="name">
          {list.total} waiting past their due date
          {label && due ? ` · ${label} report, due ${dueWords(due)}` : ""}
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
