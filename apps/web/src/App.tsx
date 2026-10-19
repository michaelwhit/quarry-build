import { useEffect, useState } from "react";
import { STATUS_LABEL, type GoalStatus } from "./data/derive.ts";
import {
  dataTotals,
  displayName,
  districtName,
  staffName,
  studentById,
  students,
} from "./data/district.ts";
import { Chip } from "./ui/Chip.tsx";
import { GoalPanel } from "./ui/GoalPanel.tsx";
import { Graph, Sparkline } from "./ui/Graph.tsx";
import { type Saved, TrackGoal, TrackPicker } from "./ui/Track.tsx";

function useRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => {
    if (theme) document.documentElement.dataset["theme"] = theme;
    else delete document.documentElement.dataset["theme"];
  }, [theme]);
  return {
    label: theme === "light" ? "Dark" : "Light",
    toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  };
}

function Dashboard() {
  const counts: Record<GoalStatus, number> = {
    met: 0,
    on_track: 0,
    needs_attention: 0,
    no_data: 0,
  };
  for (const s of students) for (const g of s.goals) counts[g.progress.status]++;
  const sorted = [...students].sort(
    (a, b) =>
      ["needs_attention", "no_data", "on_track", "met"].indexOf(a.status) -
      ["needs_attention", "no_data", "on_track", "met"].indexOf(b.status),
  );
  return (
    <>
      <ul className="tiles" aria-label="Caseload summary">
        <li className="tile">
          <div className="n">{dataTotals.students}</div>
          <div className="l">Students</div>
        </li>
        <li className="tile">
          <div className="n">{dataTotals.goals}</div>
          <div className="l">IEP goals</div>
        </li>
        {(["needs_attention", "on_track", "met"] as const).map((k) => (
          <li className="tile" key={k}>
            <div className="n">{counts[k]}</div>
            <div className="l">Goals: {STATUS_LABEL[k].toLowerCase()}</div>
          </li>
        ))}
      </ul>
      <a className="btn cta" href="#/track">
        ▶ Track a goal now
      </a>
      <h2>Caseload (needs attention first)</h2>
      <ul className="cards">
        {sorted.map((s) => {
          const first = s.goals[0];
          return (
            <li key={s.student.id}>
              <a className="card" href={`#/student/${s.student.id}`}>
                <div className="name">{displayName(s.student)}</div>
                <div className="meta">
                  Grade {s.student.grade} · {s.goals.length} goals
                </div>
                <Chip status={s.status} />
                {first && <Sparkline series={first.series} target={first.plan.target_value} />}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function StudentPage({ id }: { id: string }) {
  const s = studentById(id);
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  return (
    <>
      <a className="btn back" href="#/">
        ← Caseload
      </a>
      <h2 style={{ textTransform: "none", color: "var(--text)", fontSize: "1.4rem" }}>
        {displayName(s.student)}
      </h2>
      <p style={{ color: "var(--text-muted)" }}>
        Grade {s.student.grade} · Case ID {s.student.local_student_id}
      </p>
      {s.goals.map(({ goal, plan, series, progress }) => (
        <section className="goal" key={goal.id} aria-label={`${goal.area} goal`}>
          <div className="row">
            <h3>{goal.area.replaceAll("_", " ")}</h3>
            <Chip status={progress.status} />
          </div>
          <GoalPanel goal={goal} plan={plan} />
          <a className="btn" href={`#/track/${s.student.id}/${goal.id}`}>
            Track this goal
          </a>
          <Graph
            series={series}
            target={plan.target_value}
            label={`${goal.area.replaceAll("_", " ")} goal`}
            unit={plan.unit ?? plan.type.replaceAll("_", " ")}
          />
        </section>
      ))}
    </>
  );
}

export function App() {
  const hash = useRoute();
  const theme = useTheme();
  const m = /^#\/student\/(.+)$/.exec(hash);
  const t = /^#\/track\/([^/]+)\/([^/]+)$/.exec(hash);
  const [saved, setSaved] = useState<Saved>({});
  const onSave = (goalId: string, p: Saved[string][number]) =>
    setSaved((x) => ({ ...x, [goalId]: [...(x[goalId] ?? []), p] }));
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="watermark" role="note">
        TEST DATA · fake students only
      </div>
      <div className="watermark-bg" aria-hidden="true">
        <span>TEST DATA</span>
      </div>
      <header className="top">
        <h1>
          Demo App
          <span className="sub">
            {districtName} · {staffName}
          </span>
        </h1>
        <a className="btn" href="#/track">
          Track
        </a>
        <button type="button" onClick={theme.toggle}>
          {theme.label}
        </button>
      </header>
      <main id="main">
        {t?.[1] && t[2] ? (
          <TrackGoal studentId={t[1]} goalId={t[2]} saved={saved} onSave={onSave} />
        ) : hash.startsWith("#/track") ? (
          <TrackPicker saved={saved} />
        ) : m?.[1] ? (
          <StudentPage id={decodeURIComponent(m[1])} />
        ) : (
          <Dashboard />
        )}
      </main>
      <footer>Fake data bundled with the app. Nothing is stored in this browser.</footer>
    </>
  );
}
