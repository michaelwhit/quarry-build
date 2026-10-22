import { useEffect, useMemo, useState } from "react";
import { students } from "../data/district.ts";
import {
  WINDOWS,
  dueView,
  recordDueLoad,
  type CaseManagerDue,
  type DataGap,
  type DueItem,
  type WindowDays,
} from "../data/due.ts";
import { setPracticeDate, viewDate } from "../data/overdue.ts";
import { dueWords } from "./Overdue.tsx";

const known = new Set(students.map((s) => s.student.id));

const Student = ({ id, name }: { id: string; name: string }) =>
  known.has(id) ? (
    <a href={`#/student/${encodeURIComponent(id)}`}>
      <strong>{name}</strong>
    </a>
  ) : (
    <strong>{name}</strong>
  );

const Items = ({ items }: { items: DueItem[] }) => (
  <ul className="pick">
    {items.map((i) => (
      <li key={i.id}>
        <Student id={i.studentId} name={i.student} />
        <span className="meta">
          {" "}
          {i.what} · due {dueWords(i.dueDate)}
        </span>
      </li>
    ))}
  </ul>
);

const Gaps = ({ gaps }: { gaps: DataGap[] }) => (
  <ul className="pick">
    {gaps.map((g) => (
      <li key={g.studentId}>
        <Student id={g.studentId} name={g.student} />
        <span className="meta">
          {" "}
          {g.goalsWithoutData} of {g.goalsTotal} goal{g.goalsTotal === 1 ? "" : "s"} need data
          {g.lastRecorded ? ` · last recorded ${dueWords(g.lastRecorded)}` : " · none recorded yet"}
        </span>
      </li>
    ))}
  </ul>
);

function Manager({ m }: { m: CaseManagerDue }) {
  return (
    <section className="card" aria-label={m.caseManager}>
      <h3 className="name">{m.caseManager}</h3>
      <p className="meta">
        {m.buildings.join(" and ")} · {m.overdue.length} overdue · {m.comingUp.length} coming up ·{" "}
        {m.needsData.length} with data to record
      </p>
      {m.overdue.length > 0 && (
        <>
          <p className="name">Overdue · {m.overdue.length}</p>
          <Items items={m.overdue} />
        </>
      )}
      {m.comingUp.length > 0 && (
        <>
          <p className="name">Coming up · {m.comingUp.length}</p>
          <Items items={m.comingUp} />
        </>
      )}
      {m.needsData.length > 0 && (
        <>
          <p className="name">Data to record · {m.needsData.length}</p>
          <Gaps gaps={m.needsData} />
        </>
      )}
    </section>
  );
}

/** What is overdue, coming up and in need of data, by case manager. Read only; no export or send. */
export function Due() {
  const [date, setDate] = useState(viewDate());
  const [days, setDays] = useState<WindowDays>(WINDOWS[0]);
  const view = useMemo(() => dueView(date, days), [date, days]);
  useEffect(() => {
    recordDueLoad(view);
  }, [view]);
  const count = (pick: (m: CaseManagerDue) => number) =>
    view.managers.reduce((n, m) => n + pick(m), 0);
  return (
    <>
      <a className="btn" href="#/">
        ← Home
      </a>
      <h2 className="page-title">What's due</h2>
      <p className="meta">
        Made-up reports, dates and data for practice. These are not real students.
      </p>
      <div className="card numbers">
        <div className="name">
          {count((m) => m.overdue.length)} overdue · {count((m) => m.comingUp.length)} coming up ·{" "}
          {count((m) => m.needsData.length)} with data to record
        </div>
        <div className="meta">
          Reports and IEP dates, with students who have gone more than five school days without a
          data point on a goal.
        </div>
      </div>
      <div className="card">
        <div>
          <label>
            Coming up within{" "}
            <select value={days} onChange={(e) => setDays(Number(e.target.value) as WindowDays)}>
              {[...WINDOWS].reverse().map((w) => (
                <option key={w} value={w}>
                  {w} days
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
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
        </div>
        <p className="meta">Change the date to see how the list looks on another day.</p>
      </div>
      {view.total === 0 ? (
        <p className="empty">Nothing is due or waiting for data. Everything is up to date.</p>
      ) : (
        view.managers.map((m) => <Manager key={m.caseManager} m={m} />)
      )}
      <p className="meta">
        <a href="#/overdue">Progress reports to file, by building</a>
      </p>
    </>
  );
}
