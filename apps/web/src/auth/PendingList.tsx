import { useState } from "react";
import type { ApproveRole } from "./client.ts";

export const APPROVE_LABELS: Record<ApproveRole, string> = {
  case_manager: "Case manager",
  related_service_provider: "Related-service provider",
  paraprofessional: "Paraprofessional",
  gen_ed_teacher: "General-education teacher",
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
  /** School sign-ups only: false gets a gentle warning, never a block. */
  emailDomainMatched?: boolean | null;
}

/** Each callback answers null when it worked, or the line to show when it did not. */
export interface PendingActions {
  approve(id: string, role: ApproveRole, endsOn: string): Promise<string | null>;
  reject(id: string): Promise<string | null>;
  rejectMany(ids: string[]): Promise<string | null>;
}

function Row(props: {
  p: PendingPerson;
  act: PendingActions;
  done: () => void;
  picked: boolean;
  onPick: (on: boolean) => void;
}) {
  const { p, act, done } = props;
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
      <label>
        <input
          type="checkbox"
          checked={props.picked}
          onChange={(e) => props.onPick(e.target.checked)}
        />{" "}
        <strong>{p.displayName}</strong>
      </label>
      <p className="meta">{p.email}</p>
      {p.emailDomainMatched === false && (
        <p className="meta" role="note">
          This email isn&apos;t a district address. Check that you know this person before you
          approve.
        </p>
      )}
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
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only people still on the list count, so a stale pick never rejects a stranger.
  const chosen = picked.filter((id) => people.some((p) => p.id === id));
  const rejectChosen = async () => {
    setBusy(true);
    const e = await actions.rejectMany(chosen);
    setBusy(false);
    setConfirming(false);
    if (e === null) {
      setPicked([]);
      setError(null);
      onChanged();
    } else setError(e);
  };
  return (
    <section>
      <h3 className="sec">{`Waiting for approval (${people.length})`}</h3>
      {chosen.length > 0 && (
        <div className="actions">
          {confirming ? (
            <>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void rejectChosen()}
              >
                {`Yes, reject ${chosen.length}`}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="danger-ghost" onClick={() => setConfirming(true)}>
              {`Reject selected (${chosen.length})`}
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {people.length === 0 ? (
        <p className="empty">No one is waiting.</p>
      ) : (
        <ul className="pick">
          {people.map((p) => (
            <Row
              key={p.id}
              p={p}
              act={actions}
              done={onChanged}
              picked={chosen.includes(p.id)}
              onPick={(on) =>
                setPicked(on ? [...chosen, p.id] : chosen.filter((id) => id !== p.id))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
