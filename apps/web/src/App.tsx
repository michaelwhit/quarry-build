import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { STATUS_LABEL, type GoalStatus } from "./data/derive.ts";
import { dataTotals, displayName, districtName, studentById, students } from "./data/district.ts";
import { Chip } from "./ui/Chip.tsx";
import { Home, More, Today } from "./ui/Home.tsx";
import { Libraries } from "./ui/Libraries.tsx";
import { StudentNav, StudentSection } from "./ui/StudentSections.tsx";
import { GoalPanel } from "./ui/GoalPanel.tsx";
import { Graph, Sparkline } from "./ui/Graph.tsx";
import { AddGoal, AddStudent, ImportStudents } from "./ui/Forms.tsx";
import { TrackGoal, TrackPicker } from "./ui/Track.tsx";
import {
  can,
  getRole,
  getRoleVersion,
  delegateFallback,
  isDelegateRole,
  needsPrivacy,
  roleById,
  setRole,
  subscribeRole,
} from "./data/roles.ts";
import { safeDecode } from "./data/hash.ts";
import { pageTitle } from "./data/title.ts";
import { canSeeOverdue } from "./data/overdue.ts";
import { AtAGlance, AtAGlanceForParas, MyStudents } from "./ui/Glance.tsx";
import { Due } from "./ui/Due.tsx";
import { Overdue } from "./ui/Overdue.tsx";
import { Evaluation } from "./ui/Evaluation.tsx";
import { PresentLevels } from "./ui/PresentLevels.tsx";
import { AccessReview, StaffList } from "./ui/StaffList.tsx";
import { Privacy, SignIn } from "./ui/SignIn.tsx";
import { MeetingNotices, canUseNotices } from "./ui/MeetingNotices.tsx";
import { PriorWrittenNotice, canUsePwn } from "./ui/PriorWrittenNotice.tsx";
import { ServiceLog, canUseServiceLog } from "./ui/ServiceLog.tsx";
import { Services } from "./ui/Services.tsx";
import { ProgressReport, canUseReports } from "./ui/ProgressReport.tsx";
import { getVersion, getWorkspace, setDelegated, setServed, subscribe } from "./data/workspace.ts";

function useRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

/** After a screen change, put keyboard and screen-reader focus on the new screen's heading and name the page. */
function useAnnounceRoute(hash: string, signedIn: boolean): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (document.querySelector('[role="dialog"]')) return;
    const heading = document.querySelector<HTMLElement>("main h2");
    document.title = pageTitle(hash, heading?.textContent ?? null);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [hash, signedIn]);
}

const TABS = [
  { id: "home", title: "Home", href: "#/", icon: "⌂" },
  { id: "today", title: "Today", href: "#/today", icon: "☑" },
  { id: "caseload", title: "Caseload", href: "#/caseload", icon: "👥" },
  { id: "libraries", title: "Libraries", href: "#/libraries", icon: "📚" },
  { id: "more", title: "More", href: "#/more", icon: "⋯" },
];

function activeTab(hash: string, delegate = false): string {
  if (delegate) return hash === "#/more" ? "more" : "today";
  if (
    hash.startsWith("#/student") ||
    hash === "#/caseload" ||
    hash === "#/add-student" ||
    hash === "#/import-students"
  )
    return "caseload";
  if (hash === "#/today") return "today";
  if (hash === "#/libraries" || hash === "#/libraries/accommodations") return "libraries";
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
      {can(getRole(), "addStudent") && (
        <p>
          <a className="btn" href="#/add-student">
            Add a student
          </a>{" "}
          <a className="btn" href="#/import-students">
            Import from file
          </a>
        </p>
      )}
      {students.length === 0 && (
        <p className="empty">
          {can(getRole(), "addStudent")
            ? "No students yet. Add a made-up student, or load the sample students from the More tab."
            : getRole() === "related_service_provider"
              ? "No students are marked as served by you yet. Ask the director to mark the students you serve."
              : "No students are shared with this role yet. Sign in as the director or a case manager to share some."}
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

const decode = (part: string) => safeDecode(part) ?? "";

/** A student address that cannot be read: the same screen as a student who is not there. */
function UnknownStudent() {
  return (
    <>
      <h2 className="page-title">Student not found</h2>
      <p className="empty">This student is not here, or the address is broken.</p>
      <a className="btn" href="#/">
        ← Home
      </a>
    </>
  );
}

function NotAllowed() {
  return (
    <>
      <h2 className="page-title">Not available for this role</h2>
      <p className="empty">Sign in as a different practice role to do this.</p>
      <a className="btn" href="#/">
        ← Home
      </a>
    </>
  );
}

function StudentPage({ id }: { id: string }) {
  useSyncExternalStore(subscribe, getVersion);
  const role = getRole();
  const ws = getWorkspace();
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
      {s.student.local_student_id && (
        <p style={{ color: "var(--text-muted)" }}>
          Grade {s.student.grade} · Case ID {s.student.local_student_id}
        </p>
      )}
      <StudentNav studentId={s.student.id} active="goals" />
      <p>
        {can(role, "editGoal") && (
          <a className="btn" href={`#/student/${s.student.id}/add-goal`}>
            Add a goal
          </a>
        )}{" "}
        {can(role, "editGoal") && (
          <a className="btn" href="#/libraries">
            Assign from library
          </a>
        )}{" "}
        {canUseReports(role) && (
          <a className="btn" href={`#/student/${s.student.id}/report`}>
            Progress report
          </a>
        )}{" "}
        {canUseServiceLog(role) && (
          <a className="btn" href={`#/student/${s.student.id}/service-log`}>
            Service minutes
          </a>
        )}{" "}
        {canUsePwn(role) && (
          <a className="btn" href={`#/student/${s.student.id}/pwn`}>
            Prior Written Notice
          </a>
        )}
      </p>
      {can(role, "assignServed") && (
        <label className="check">
          <input
            type="checkbox"
            checked={ws.served.includes(s.student.id)}
            onChange={(e) => setServed(s.student.id, e.target.checked)}
          />
          Served by an SLP or school psychologist (they can see this student)
        </label>
      )}
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
          {can(role, "editGoal") && (
            <a className="btn" href={`#/student/${s.student.id}/goal/${goal.id}/edit`}>
              Edit goal
            </a>
          )}
          {can(role, "share") && (
            <label className="check">
              <input
                type="checkbox"
                checked={ws.delegated.includes(goal.id)}
                onChange={(e) => setDelegated(goal.id, e.target.checked)}
              />
              Paras and gen-ed teachers may enter data for this goal
            </label>
          )}
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
  useEffect(() => {
    // The tour is a plain page of its own (it must work with scripts off); #/tour is its short address.
    if (hash === "#/tour") window.location.replace("tour/");
  }, [hash]);
  const theme = useTheme();
  const m = /^#\/student\/(.+)$/.exec(hash);
  const active = activeTab(hash, isDelegateRole(getRole()));
  const t = /^#\/track\/([^/]+)\/([^/]+)$/.exec(hash);
  const [noticeSeen, setNoticeSeen] = useState(false);
  // Re-render on every practice-data change; the views are rebuilt in data/district.ts.
  useSyncExternalStore(subscribe, getVersion);
  useSyncExternalStore(subscribeRole, getRoleVersion);
  const role = getRole();
  useAnnounceRoute(hash, role !== null);
  const allow = (a: Parameters<typeof can>[1]) => can(role, a);
  const g = /^#\/student\/([^/]+)\/add-goal$/.exec(hash);
  const rp = /^#\/student\/([^/]+)\/report$/.exec(hash);
  const pl = /^#\/student\/([^/]+)\/present-levels$/.exec(hash);
  const sv = /^#\/student\/([^/]+)\/services$/.exec(hash);
  const sl = /^#\/student\/([^/]+)\/service-log$/.exec(hash);
  const pw = /^#\/student\/([^/]+)\/pwn$/.exec(hash);
  const es = /^#\/student\/([^/]+)\/edit$/.exec(hash);
  const ss = /^#\/student\/([^/]+)\/(accommodations|behavior)$/.exec(hash);
  const eg = /^#\/student\/([^/]+)\/goal\/([^/]+)\/edit$/.exec(hash);
  const delegate = isDelegateRole(role);
  // Paras and gen-ed teachers get Today and More, and the session screen reached from Today.
  const glance = /^#\/glance\/([^/]+)$/.exec(hash);
  const delegateOk =
    hash === "#/today" ||
    hash === "#/more" ||
    (role === "gen_ed_teacher" && glance?.[1]) ||
    (role === "paraprofessional" && t?.[1] && t[2]);
  const brokenAddress = [
    pl?.[1],
    sv?.[1],
    rp?.[1],
    glance?.[1],
    es?.[1],
    ss?.[1],
    eg?.[1],
    eg?.[2],
    g?.[1],
    m?.[1],
  ].some((x) => x !== undefined && safeDecode(x) === null);
  const screen = brokenAddress ? (
    <UnknownStudent />
  ) : role === "gen_ed_teacher" && hash === "#/today" ? (
    <MyStudents />
  ) : role === "gen_ed_teacher" && glance?.[1] ? (
    <AtAGlance studentId={decode(glance[1])} />
  ) : role === "paraprofessional" && glance?.[1] ? (
    <AtAGlanceForParas />
  ) : delegate && !delegateOk ? (
    delegateFallback(role) === "my_students" ? (
      <MyStudents />
    ) : (
      <Today />
    )
  ) : hash === "#/due" ? (
    canSeeOverdue(role) ? (
      <Due />
    ) : (
      <NotAllowed />
    )
  ) : hash === "#/overdue" ? (
    canSeeOverdue(role) ? (
      <Overdue />
    ) : (
      <NotAllowed />
    )
  ) : t?.[1] && t[2] ? (
    <TrackGoal studentId={t[1]} goalId={t[2]} />
  ) : hash.startsWith("#/track") ? (
    <TrackPicker />
  ) : hash === "#/add-student" ? (
    allow("addStudent") ? (
      <AddStudent />
    ) : (
      <NotAllowed />
    )
  ) : hash === "#/import-students" ? (
    allow("addStudent") ? (
      <ImportStudents />
    ) : (
      <NotAllowed />
    )
  ) : es?.[1] ? (
    allow("editStudent") ? (
      <AddStudent editId={decode(es[1])} />
    ) : (
      <NotAllowed />
    )
  ) : eg?.[1] && eg[2] ? (
    allow("editGoal") ? (
      <AddGoal studentId={decode(eg[1])} editGoalId={decode(eg[2])} />
    ) : (
      <NotAllowed />
    )
  ) : g?.[1] ? (
    allow("editGoal") ? (
      <AddGoal studentId={decode(g[1])} />
    ) : (
      <NotAllowed />
    )
  ) : pl?.[1] ? (
    <PresentLevels studentId={decode(pl[1])} />
  ) : sv?.[1] ? (
    <Services studentId={decode(sv[1])} />
  ) : sl?.[1] ? (
    <ServiceLog studentId={decode(sl[1])} />
  ) : pw?.[1] ? (
    <PriorWrittenNotice studentId={decode(pw[1])} />
  ) : ss?.[1] && ss[2] ? (
    <StudentSection id={decode(ss[1])} section={ss[2] as "accommodations" | "behavior"} />
  ) : rp?.[1] ? (
    <ProgressReport studentId={decode(rp[1])} />
  ) : m?.[1] ? (
    <StudentPage id={decode(m[1])} />
  ) : hash === "#/caseload" ? (
    <Caseload />
  ) : hash === "#/meeting-notices" ? (
    canUseNotices(role) ? (
      <MeetingNotices />
    ) : (
      <NotAllowed />
    )
  ) : hash === "#/evaluation" ? (
    allow("evaluation") ? (
      <Evaluation />
    ) : (
      <NotAllowed />
    )
  ) : hash === "#/staff" ? (
    allow("staffRoles") ? (
      <StaffList />
    ) : (
      <NotAllowed />
    )
  ) : hash === "#/access-review" ? (
    allow("staffRoles") ? (
      <AccessReview />
    ) : (
      <NotAllowed />
    )
  ) : hash === "#/today" ? (
    <Today />
  ) : hash === "#/libraries" || hash === "#/libraries/accommodations" ? (
    <Libraries key={hash} start={hash.endsWith("/accommodations") ? "accommodations" : "goals"} />
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
      {noticeSeen || !role ? null : (
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
      {role && (
        <div className="watermark-bg" aria-hidden="true">
          <span>TEST DATA</span>
        </div>
      )}
      {/* The page scrolls inside this box, so the tab bar below it can never move on a phone. */}
      <div className="scroll">
        {role && (
          <aside className="watermark" aria-label="Test data notice">
            TEST DATA · fake students only
          </aside>
        )}
        <header className="top">
          <h1>
            GoalLine
            <span className="sub">{role ? roleById(role)?.person : districtName}</span>
          </h1>
          <button type="button" onClick={theme.toggle}>
            {theme.label}
          </button>
          {role && (
            <button type="button" onClick={() => setRole(null)}>
              Sign out
            </button>
          )}
        </header>
        {role && needsPrivacy(role) ? (
          <Privacy role={role} />
        ) : role ? (
          <main id="main">{screen}</main>
        ) : (
          <SignIn />
        )}
        <footer>
          Practice data only. Not for real students. What you add stays in this browser and is never
          sent anywhere.
        </footer>
      </div>
      <nav className="tabbar" aria-label="Main" hidden={!role}>
        {TABS.filter((x) => !delegate || x.id === "today" || x.id === "more").map((tab) => (
          <a
            key={tab.id}
            href={tab.href}
            className={tab.id === active ? "tab on" : "tab"}
            aria-current={tab.id === active ? "page" : undefined}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {role === "gen_ed_teacher" && tab.id === "today" ? "My students" : tab.title}
          </a>
        ))}
      </nav>
    </>
  );
}
