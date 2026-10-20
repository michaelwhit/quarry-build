import { useState } from "react";
import { dueFor } from "../data/derive.ts";
import { displayName, districtName, goalCounts, students } from "../data/district.ts";
import { clearAll, exportText, getWorkspace, importText, loadSample } from "../data/workspace.ts";

interface Tile {
  title: string;
  subtitle: string;
  icon: string;
  /** Undefined means not built on the web yet. */
  href?: string;
}

// Same tiles and order as the native Home screen. A tile for something the web app does not do
// yet says "Planned" and opens nothing, so nothing here is fake.
const TILES: Tile[] = [
  { title: "Today", subtitle: "Start a session", icon: "☑", href: "#/today" },
  { title: "Track progress", subtitle: "Pick a student and goal", icon: "◎", href: "#/track" },
  { title: "Caseload", subtitle: "Your students", icon: "👥", href: "#/caseload" },
  { title: "Goal library", subtitle: "Find and add goals", icon: "📚" },
  {
    title: "Accommodations",
    subtitle: "Find supports, set where, how often, how long",
    icon: "✋",
  },
  {
    title: "Draft from evaluation",
    subtitle: "Goals and accommodations from test results",
    icon: "🔍",
  },
  { title: "Present levels", subtitle: "Draft the present-levels section", icon: "¶" },
  {
    title: "Goal graphs",
    subtitle: "See progress over time",
    icon: "📈",
    href: "#/caseload",
  },
];

export function Home() {
  const c = goalCounts();
  return (
    <>
      <p className="eyebrow">{districtName.replace(" (synthetic)", "")}</p>
      <h2 className="page-title">Home</h2>
      <a className="card numbers" href="#/caseload" aria-label="Open the caseload summary">
        <div className="name">
          {students.length} students · {c.goals} goals
        </div>
        <div className="chips">
          <span className="chip on_track">
            <span aria-hidden="true">▲</span>
            {c.onTrack} on track
          </span>
          <span className="chip needs_attention">
            <span aria-hidden="true">!</span>
            {c.needsLook} need a look
          </span>
        </div>
      </a>
      {students.length === 0 && (
        <div className="card empty-start">
          <p className="name">Start with a made-up student</p>
          <p className="meta">
            Practice data only. Add your own made-up students and goals, or load the sample
            students.
          </p>
          <div className="actions">
            <a className="btn save" href="#/add-student">
              Add a student
            </a>
            <button type="button" onClick={loadSample}>
              Load sample students
            </button>
          </div>
        </div>
      )}
      <ul className="home-tiles">
        {TILES.map((t) => (
          <li key={t.title}>
            {t.href ? (
              <a className="card tile-card" href={t.href}>
                <span className="ticon" aria-hidden="true">
                  {t.icon}
                </span>
                <strong>{t.title}</strong>
                <span className="meta">{t.subtitle}</span>
              </a>
            ) : (
              <div
                className="card tile-card planned"
                aria-label={`${t.title}. ${t.subtitle}. Planned, not available yet.`}
              >
                <span className="ticon" aria-hidden="true">
                  {t.icon}
                </span>
                <span className="planned-tag">Planned</span>
                <strong>{t.title}</strong>
                <span className="meta">{t.subtitle}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function PlannedScreen({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h2 className="page-title">{title}</h2>
      <div className="card planned-card">
        <span className="planned-tag">Planned</span>
        <p>{text}</p>
        <a className="btn" href="#/">
          ← Home
        </a>
      </div>
    </>
  );
}

const PERIOD_WORD = { day: "today", week: "this week", month: "this month" } as const;

/** The goals that still need a session on their schedule, then the ones that are caught up. */
export function Today() {
  const rows = students.flatMap((s) =>
    s.goals.map((g) => ({ s, g, due: dueFor(g.plan.frequency, g.series) })),
  );
  const todo = rows.filter((r) => r.due.due);
  const done = rows.filter((r) => !r.due.due);
  const item = (r: (typeof rows)[number]) => (
    <li key={r.g.goal.id}>
      <a className="pick-btn" href={`#/track/${r.s.student.id}/${r.g.goal.id}`}>
        <strong>{displayName(r.s.student)}</strong>
        <span style={{ textTransform: "capitalize" }}>{r.g.goal.area.replaceAll("_", " ")}</span>
        <span>{r.g.goal.statement}</span>
        <span className="meta">
          {r.due.done} of {r.due.required} {PERIOD_WORD[r.due.period]} · {r.g.plan.frequency}
        </span>
      </a>
    </li>
  );
  return (
    <>
      <p className="eyebrow">{new Date().toLocaleDateString(undefined, { dateStyle: "full" })}</p>
      <h2 className="page-title">Today</h2>
      {rows.length === 0 ? (
        <p className="empty">
          No goals yet. <a href="#/add-student">Add a made-up student</a> and a goal, or load the
          sample students from the More tab.
        </p>
      ) : (
        <>
          <h3 className="sec">To do ({todo.length})</h3>
          {todo.length === 0 ? (
            <p className="empty">Every goal is caught up for its schedule.</p>
          ) : (
            <ul className="pick">{todo.map(item)}</ul>
          )}
          {done.length > 0 && (
            <>
              <h3 className="sec">Caught up ({done.length})</h3>
              <ul className="pick">{done.map(item)}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}

export function More() {
  const [armed, setArmed] = useState<"sample" | "clear" | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [fileMessage, setFileMessage] = useState("");
  const c = goalCounts();
  const points = getWorkspace().points.length;
  const hasData = students.length > 0;
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportText()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `goalline-practice-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <h2 className="page-title">More</h2>
      <section className="card">
        <h3 className="sec">Signed in</h3>
        <p className="name">Demo account</p>
        <p className="meta">Sign-in with school accounts comes before any real student data.</p>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">Practice data</h3>
        <p className="meta">
          {students.length} student{students.length === 1 ? "" : "s"}, {c.goals} goal
          {c.goals === 1 ? "" : "s"}, {points} data point{points === 1 ? "" : "s"}. Made up only. It
          stays in this browser and is never sent anywhere.
        </p>
        <div className="actions">
          {armed === "sample" ? (
            <>
              <button type="button" className="save" onClick={() => (loadSample(), setArmed(null))}>
                Replace with sample students
              </button>
              <button type="button" onClick={() => setArmed(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => (hasData ? setArmed("sample") : loadSample())}>
              Load sample students
            </button>
          )}
          {armed === "clear" ? (
            <>
              <button type="button" className="save" onClick={() => (clearAll(), setArmed(null))}>
                Yes, clear practice data
              </button>
              <button type="button" onClick={() => setArmed(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setArmed("clear")} disabled={!hasData}>
              Clear practice data
            </button>
          )}
        </div>
        <h4 className="sec" style={{ marginTop: 16 }}>
          Save to a file or load from a file
        </h4>
        <p className="meta">
          The file holds made-up data only. Load only files you saved from this app; loading
          replaces what is here.
        </p>
        <div className="actions">
          <button type="button" onClick={download} disabled={!hasData}>
            Save practice data to a file
          </button>
          <label className="btn file-btn">
            Load from a file
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 4_000_000) {
                  setFileMessage("That file is too large.");
                  return;
                }
                void f.text().then((t) => {
                  if (hasData) {
                    setPending(t);
                    setFileMessage("");
                  } else setFileMessage(importText(t).message);
                });
              }}
            />
          </label>
        </div>
        {pending !== null && (
          <div className="actions">
            <button
              type="button"
              className="save"
              onClick={() => {
                setFileMessage(importText(pending).message);
                setPending(null);
              }}
            >
              Replace what is here with the file
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
        <p className="saved" role="status">
          {fileMessage}
        </p>
      </section>
    </>
  );
}
