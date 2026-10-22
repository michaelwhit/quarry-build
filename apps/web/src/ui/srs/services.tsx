import { useState, useSyncExternalStore } from "react";
import { accommodations } from "../../data/library.ts";
import {
  type RowDraft,
  type ServiceKind,
  SERVICE_KINDS,
  addServiceRow,
  getServices,
  getServicesVersion,
  removeServiceRow,
  rowProblem,
  subscribeServices,
} from "../../data/serviceRows.ts";

const EMPTY: RowDraft = {
  kind: "special_education",
  title: "",
  start: "",
  end: "",
  frequency: "",
  duration: "",
  location: "",
  followsCalendar: true,
};

/** Entry form and list for the Services section of the IEP for SRS page. Practice data only. */
export const section = "services";

export function Form({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeServices, getServicesVersion, getServicesVersion);
  const [d, setD] = useState<RowDraft>(EMPTY);
  const rows = getServices(studentId).rows;
  const set = (p: Partial<RowDraft>) => setD({ ...d, ...p });
  const problem = rowProblem(d);
  const fromLibrary = (id: string) => {
    const a = accommodations.find((x) => x.id === id);
    if (a)
      set({
        kind: "accommodation",
        title: a.title,
        frequency: a.frequency,
        duration: a.duration,
        location: a.location,
      });
  };
  return (
    <div className="form">
      <h4>Services and supports for this student</h4>
      {rows.length === 0 && <p className="empty">No services added yet.</p>}
      <ul className="pick">
        {rows.map((r) => (
          <li key={r.id}>
            <strong>{r.title}</strong>{" "}
            <span className="meta">
              {SERVICE_KINDS.find((k) => k.id === r.kind)?.label} · {r.frequency} · {r.duration} ·{" "}
              {r.location}
            </span>{" "}
            <button
              type="button"
              className="btn"
              aria-label={`Remove ${r.title}`}
              onClick={() => removeServiceRow(studentId, r.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label>
        Add from the accommodation library
        <select value="" onChange={(e) => fromLibrary(e.target.value)}>
          <option value="">Choose one to fill the row</option>
          {accommodations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select value={d.kind} onChange={(e) => set({ kind: e.target.value as ServiceKind })}>
          {SERVICE_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Service
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label>
        Start date
        <input type="date" value={d.start} onChange={(e) => set({ start: e.target.value })} />
      </label>
      <label>
        End date (optional)
        <input type="date" value={d.end} onChange={(e) => set({ end: e.target.value })} />
      </label>
      <label>
        Frequency
        <input
          value={d.frequency}
          placeholder="22 days/semester"
          onChange={(e) => set({ frequency: e.target.value })}
        />
      </label>
      <label>
        Duration
        <input
          value={d.duration}
          placeholder="15 min/day"
          onChange={(e) => set({ duration: e.target.value })}
        />
      </label>
      <label>
        Location
        <input value={d.location} onChange={(e) => set({ location: e.target.value })} />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={d.followsCalendar}
          onChange={(e) => set({ followsCalendar: e.target.checked })}
        />
        Follows the school calendar
      </label>
      {problem && d.title.trim() !== "" && (
        <p role="note" className="empty">
          {problem}
        </p>
      )}
      <button
        type="button"
        className="btn"
        disabled={d.title.trim() === ""}
        onClick={() => {
          addServiceRow(studentId, d);
          setD(EMPTY);
        }}
      >
        Add row
      </button>
    </div>
  );
}
