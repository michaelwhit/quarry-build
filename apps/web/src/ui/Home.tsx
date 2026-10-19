import { useState } from "react";
import { districtName, goalCounts, students } from "../data/district.ts";
import { clearAll, getWorkspace, loadSample } from "../data/workspace.ts";

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
  { title: "Today", subtitle: "Start a session", icon: "☑" },
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

export function More() {
  const [armed, setArmed] = useState<"sample" | "clear" | null>(null);
  const c = goalCounts();
  const points = getWorkspace().points.length;
  const hasData = students.length > 0;
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
      </section>
    </>
  );
}
