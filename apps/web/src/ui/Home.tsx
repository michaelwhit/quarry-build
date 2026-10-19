import { districtName, goalCounts, students } from "../data/district.ts";

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

export function More({ saved, onReset }: { saved: number; onReset: () => void }) {
  return (
    <>
      <h2 className="page-title">More</h2>
      <section className="card">
        <h3 className="sec">Signed in</h3>
        <p className="name">Demo account</p>
        <p className="meta">Sign-in with school accounts comes before any real student data.</p>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">Demo data</h3>
        <p className="meta">
          {saved} session{saved === 1 ? "" : "s"} saved this visit. They live only while this page
          is open.
        </p>
        <button type="button" onClick={onReset} disabled={saved === 0}>
          Reset demo data
        </button>
      </section>
    </>
  );
}
