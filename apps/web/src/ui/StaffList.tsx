import { lazy, Suspense, useState } from "react";
import {
  FILTERS,
  ROLE_LINES,
  type StaffFilter,
  TEXT,
  accessCsv,
  accessRoster,
  filterStaff,
  roleName,
  staffRows,
} from "../data/staffList.ts";

// Sign-up approval talks to the sign-in server, so it exists only in a build made with a server
// address (VITE_GOALLINE_API_ORIGIN). Otherwise this is null and the bundler drops the auth code.
const AdminSignups = import.meta.env.VITE_GOALLINE_API_ORIGIN
  ? lazy(() => import("../auth/AdminSignups.tsx").then((m) => ({ default: m.AdminSignups })))
  : null;

/** The director's read-only Staff and roles list: search, role chips, one card per person. */
export function StaffList() {
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [search, setSearch] = useState("");
  const rows = filterStaff(staffRows(), filter, search);
  return (
    <>
      <a className="back btn" href="#/">
        ← Home
      </a>
      <h2 className="page-title">{TEXT.title}</h2>
      {AdminSignups && (
        <Suspense fallback={null}>
          <AdminSignups />
        </Suspense>
      )}
      <p className="meta">{TEXT.roleHelp}</p>
      <label className="form staff-search">
        <span>{TEXT.searchLabel}</span>
        <input
          type="search"
          value={search}
          maxLength={80}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="chips" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip-button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="empty">{TEXT.empty}</p>
      ) : (
        <ul className="cards" aria-label="Staff">
          {rows.map((r) => (
            <li key={r.id} className="card">
              <div className="name">{r.name}</div>
              <div className="meta">{roleName(r.role)}</div>
              <div className="meta">
                {[r.position, r.detail].filter((x) => x !== "").join(" · ")}
              </div>
              <div className="meta">{ROLE_LINES[r.role]}</div>
            </li>
          ))}
        </ul>
      )}
      <a className="btn" href="#/access-review">
        {TEXT.rosterExport}
      </a>
    </>
  );
}

/** Who may see student records, with a button to save the list as a CSV file. */
export function AccessReview() {
  const rows = accessRoster();
  const save = () => {
    const url = URL.createObjectURL(new Blob([accessCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "who-can-see-student-records.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <a className="back btn" href="#/staff">
        ← {TEXT.title}
      </a>
      <h2 className="page-title">{TEXT.rosterTitle}</h2>
      <p className="meta">{TEXT.rosterNote}</p>
      <ul className="cards" aria-label={TEXT.rosterTitle}>
        {rows.map((r) => (
          <li key={r.id} className="card">
            <div className="name">{r.name}</div>
            <div className="meta">
              {r.role} · {r.position}
            </div>
          </li>
        ))}
      </ul>
      <div className="actions stack">
        <button type="button" className="save" onClick={save} disabled={rows.length === 0}>
          {TEXT.saveCsv}
        </button>
      </div>
    </>
  );
}
