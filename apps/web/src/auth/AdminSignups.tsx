import { useCallback, useEffect, useState } from "react";
import { approveSignup, createInvite, listSignups, rejectSignup } from "./client.ts";
import type { Signup } from "./client.ts";
import { APPROVE_LABELS, PendingList } from "./PendingList.tsx";
import type { ApproveRole } from "./client.ts";
import type { PendingActions } from "./PendingList.tsx";

const actions = (done: (line: string) => void): PendingActions => ({
  approve: async (id, role, endsOn) => {
    const r = await approveSignup(id, role, endsOn);
    if (!r.ok) return r.message;
    done(
      `Approved as ${APPROVE_LABELS[r.value.role as ApproveRole] ?? r.value.role}. They can sign in now.`,
    );
    return null;
  },
  reject: async (id) => {
    const r = await rejectSignup(id);
    return r.ok ? null : r.message;
  },
});

/** The director's page: make an invite code, see who is waiting, approve or reject. Not mounted yet. */
export function AdminSignups() {
  const [people, setPeople] = useState<Signup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);

  const load = useCallback(async () => {
    const r = await listSignups();
    if (r.ok) {
      setPeople(r.value);
      setError(null);
    } else setError(r.message);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const makeInvite = async () => {
    const r = await createInvite();
    if (r.ok) setInvite(r.value);
    else setError(r.message);
  };

  return (
    <>
      <section className="card">
        <h3 className="sec">Invite a new staff member</h3>
        {invite ? (
          <>
            <p className="name" aria-live="polite">
              {invite.code}
            </p>
            <p className="meta">
              Give this to the new staff member in person. It works once, for 48 hours. It is shown
              only now.
            </p>
            <button type="button" onClick={() => setInvite(null)}>
              Hide the code
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void makeInvite()}>
            Make an invite code
          </button>
        )}
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="saved" role="status">
          {notice}
        </p>
      )}
      {people && (
        <PendingList
          people={people.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            email: p.email,
            requestedAt: p.createdAt,
          }))}
          actions={actions(setNotice)}
          onChanged={() => void load()}
        />
      )}
    </>
  );
}
