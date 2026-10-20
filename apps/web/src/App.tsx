import { useEffect, useState, useSyncExternalStore } from "react";
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
import { Home, More, PlannedScreen, Today } from "./ui/Home.tsx";
import { GoalPanel } from "./ui/GoalPanel.tsx";
import { Graph, Sparkline } from "./ui/Graph.tsx";
import { AddGoal, AddStudent } from "./ui/Forms.tsx";
import { TrackGoal, TrackPicker } from "./ui/Track.tsx";
import { getVersion, subscribe } from "./data/workspace.ts";

function useRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const TABS = [
  { id: "home", title: "Home", href: "#/", icon: "⌂" },
  { id: "today", title: "Today", href: "#/today", icon: "☑" },
  { id: "caseload", title: "Caseload", href: "#/caseload", icon: "👥" },
  { id: "libraries", title: "Libraries", href: "#/libraries", icon: "📚" },
  { id: "more", title: "More", href: "#/more", icon: "⋯" },
];

function activeTab(hash: string): string {
  if (hash.startsWith("#/student") || hash === "#/caseload" || hash === "#/add-student")
    return "caseload";
  if (hash === "#/today") return "today";
  if (hash === "#/libraries") return "libraries";
  if (hash === "#/more") return "more";
  // Track screens (#/track...) are reached from Home, so Home stays highlighted on purpose.
  return "home";
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

function Caseload() {
  const totals = dataTotals();
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
          <div className="n">{totals.students}</div>
          <div className="l">Students</div>
        </li>
        <li className="tile">
          <div className="n">{totals.goals}</div>
          <div className="l">IEP goals</div>
        </li>
        {(["needs_attention", "on_track", "met"] as const).map((k) => (
          <li className="tile" key={k}>
            <div className="n">{counts[k]}</div>
            <div className="l">Goals: {STATUS_LABEL[k].toLowerCase()}</div>
          </li>
        ))}
      </ul>
      <h2>Caseload (needs attention first)</h2>
      <p>
        <a className="btn" href="#/add-student">
          Add a student
        </a>
      </p>
      {students.length === 0 && (
        <p className="empty">
          No students yet. Add a made-up student, or load the sample students from the More tab.
        </p>
      )}
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
      <p>
        <a className="btn" href={`#/student/${s.student.id}/add-goal`}>
          Add a goal
        </a>{" "}
        <a className="btn" href={`#/student/${s.student.id}/edit`}>
          Edit student
        </a>
      </p>
      {s.goals.length === 0 && <p className="empty">No goals yet.</p>}
      {s.goals.map(({ goal, plan, series, progress }) => (
        <section className="goal" key={goal.id} aria-label={`${goal.area} goal`}>
          <div className="row">
            <h3>{goal.area.replaceAll("_", " ")}</h3>
            <Chip status={progress.status} />
          </div>
          <GoalPanel goal={goal} plan={plan} />
          <a className="btn" href={`#/track/${s.student.id}/${goal.id}`}>
            Track this goal
          </a>{" "}
          <a className="btn" href={`#/student/${s.student.id}/goal/${goal.id}/edit`}>
            Edit goal
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
  const active = activeTab(hash);
  const t = /^#\/track\/([^/]+)\/([^/]+)$/.exec(hash);
  const [noticeSeen, setNoticeSeen] = useState(false);
  // Re-render on every practice-data change; the views are rebuilt in data/district.ts.
  useSyncExternalStore(subscribe, getVersion);
  const g = /^#\/student\/([^/]+)\/add-goal$/.exec(hash);
  const es = /^#\/student\/([^/]+)\/edit$/.exec(hash);
  const eg = /^#\/student\/([^/]+)\/goal\/([^/]+)\/edit$/.exec(hash);
  const screen =
    t?.[1] && t[2] ? (
      <TrackGoal studentId={t[1]} goalId={t[2]} />
    ) : hash.startsWith("#/track") ? (
      <TrackPicker />
    ) : hash === "#/add-student" ? (
      <AddStudent />
    ) : es?.[1] ? (
      <AddStudent editId={decodeURIComponent(es[1])} />
    ) : eg?.[1] && eg[2] ? (
      <AddGoal studentId={decodeURIComponent(eg[1])} editGoalId={decodeURIComponent(eg[2])} />
    ) : g?.[1] ? (
      <AddGoal studentId={decodeURIComponent(g[1])} />
    ) : m?.[1] ? (
      <StudentPage id={decodeURIComponent(m[1])} />
    ) : hash === "#/caseload" ? (
      <Caseload />
    ) : hash === "#/today" ? (
      <Today />
    ) : hash === "#/libraries" ? (
      <PlannedScreen
        title="Libraries"
        text="The goal and accommodation libraries are not on the web yet."
      />
    ) : hash === "#/more" ? (
      <More />
    ) : (
      <Home />
    );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      {noticeSeen ? null : (
        <div className="notice-backdrop">
          <div className="notice" role="dialog" aria-modal="true" aria-labelledby="notice-title">
            <h2 id="notice-title">Practice data, no real students</h2>
            <p>
              Practice data stays in this browser on this device. It is never sent anywhere. Do not
              type real student names or details.
            </p>
            <p>You can remove it all with Clear practice data on the More tab.</p>
            <button type="button" autoFocus onClick={() => setNoticeSeen(true)}>
              I understand
            </button>
          </div>
        </div>
      )}
      <div className="watermark" role="note">
        TEST DATA · fake students only
      </div>
      <div className="watermark-bg" aria-hidden="true">
        <span>TEST DATA</span>
      </div>
      <header className="top">
        <h1>
          GoalLine
          <span className="sub">
            {districtName} · {staffName}
          </span>
        </h1>
        <button type="button" onClick={theme.toggle}>
          {theme.label}
        </button>
      </header>
      <main id="main">{screen}</main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <a
            key={tab.id}
            href={tab.href}
            className={tab.id === active ? "tab on" : "tab"}
            aria-current={tab.id === active ? "page" : undefined}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.title}
          </a>
        ))}
      </nav>
      <footer>
        Practice data only. What you add stays in this browser and is never sent anywhere.
      </footer>
    </>
  );
}
