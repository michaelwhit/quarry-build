import { useState } from "react";
import type { ApproveRole } from "./client.ts";

export const APPROVE_LABELS: Record<ApproveRole, string> = {
  case_manager: "Case manager",
  related_service_provider: "Related-service provider",
  paraprofessional: "Paraprofessional",
  gen_ed_teacher: "General-education teacher",
  building_coordinator: "Building coordinator",
};

/** June 30 of the school year that is running (or about to start in August). */
export function defaultEndsOn(today = new Date()): string {
  const year = today.getMonth() >= 7 ? today.getFullYear() + 1 : today.getFullYear();
  return `${year}-06-30`;
}

export interface PendingPerson {
  id: string;
  displayName: string;
  email: string;
  requestedAt: string;
}

/** Each callback answers null when it worked, or the line to show when it did not. */
export interface PendingActions {
  approve(id: string, role: ApproveRole, endsOn: string): Promise<string | null>;
  reject(id: string): Promise<string | null>;
}

function Row({ p, act, done }: { p: PendingPerson; act: PendingActions; done: () => void }) {
  const [role, setRole] = useState<ApproveRole | "">("");
  const [endsOn, setEndsOn] = useState(defaultEndsOn());
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (f: () => Promise<string | null>) => {
    setBusy(true);
    const e = await f();
    setBusy(false);
    if (e === null) done();
    else setError(e);
  };
  return (
    <li className="card">
      <strong>{p.displayName}</strong>
      <p className="meta">{p.email}</p>
      <label className="form">
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as ApproveRole | "")}>
          <option value="">Choose a role</option>
          {(Object.keys(APPROVE_LABELS) as ApproveRole[]).map((r) => (
            <option key={r} value={r}>
              {APPROVE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="form">
        <span>Access ends on</span>
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="save"
          disabled={role === "" || endsOn === "" || busy}
          onClick={() => role !== "" && void run(() => act.approve(p.id, role, endsOn))}
        >
          Approve
        </button>
        {rejecting ? (
          <>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void run(() => act.reject(p.id))}
            >
              Yes, reject
            </button>
            <button type="button" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="danger-ghost"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            Reject
          </button>
        )}
      </div>
    </li>
  );
}

/** People who asked for access and are waiting for the director. Approving needs a role. */
export function PendingList({
  people,
  actions,
  onChanged,
}: {
  people: PendingPerson[];
  actions: PendingActions;
  onChanged: () => void;
}) {
  return (
    <section>
      <h3 className="sec">{`Waiting for approval (${people.length})`}</h3>
      {people.length === 0 ? (
        <p className="empty">No one is waiting.</p>
      ) : (
        <ul className="pick">
          {people.map((p) => (
            <Row key={p.id} p={p} act={actions} done={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
