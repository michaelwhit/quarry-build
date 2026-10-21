import { useCallback, useEffect, useRef, useState } from "react";
import {
  approveSignup,
  createInvite,
  listSignups,
  rejectSignup,
  rejectSignups,
  setSchoolListing,
} from "./client.ts";
import type { Signup } from "./client.ts";
import { APPROVE_LABELS, PendingList } from "./PendingList.tsx";
import type { ApproveRole } from "./client.ts";
import type { PendingActions } from "./PendingList.tsx";

/** Shown once, then gone. Never stored beyond the dialog. */
export interface SetupCode {
  name: string;
  code: string;
  endsAt: string;
}

/** A new code goes to the back of the line; the one on screen is never replaced. */
export const pushSetup = (queue: SetupCode[], next: SetupCode): SetupCode[] => [...queue, next];
/** Hiding the code on screen brings the next one up. */
export const popSetup = (queue: SetupCode[]): SetupCode[] => queue.slice(1);

const actions = (
  done: (line: string) => void,
  setup: (id: string, code: string, endsAt: string) => void,
): PendingActions => ({
  approve: async (id, role, endsOn) => {
    const r = await approveSignup(id, role, endsOn);
    if (!r.ok) return r.message;
    const label = APPROVE_LABELS[r.value.role as ApproveRole] ?? r.value.role;
    // Every approval hands back a setup code: it is how the person sets their password.
    if (r.value.setupCode) {
      setup(id, r.value.setupCode, r.value.setupCodeExpiresAt ?? "");
      done(`Approved as ${label}. Give them the setup code before they can sign in.`);
    } else
      done(
        `Approved as ${label}, but no setup code came back. Reload this page and check that they are still listed.`,
      );
    return null;
  },
  rejectMany: async (ids) => {
    const r = await rejectSignups(ids);
    return r.ok ? null : r.message;
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
  // Codes are shown once. A second approval waits in line behind the one on screen.
  const [setups, setSetups] = useState<SetupCode[]>([]);
  const setup = setups[0] ?? null;
  const [listed, setListed] = useState<boolean | null>(null);

  const loads = useRef(0);
  const load = useCallback(async () => {
    const mine = ++loads.current;
    const r = await listSignups();
    // An older answer that arrives late must not replace a newer list.
    if (mine !== loads.current) return;
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

  const pickListing = async (on: boolean) => {
    const r = await setSchoolListing(on);
    if (r.ok) {
      setListed(r.value);
      setError(null);
    } else setError(r.message);
  };

  // The setup code's end time comes from the server; say nothing about it if it cannot be read.
  const ends = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : ` and ends ${d.toLocaleString()}`;
  };

  return (
    <>
      {setup && (
        <section className="card" role="alertdialog" aria-labelledby="setup-title">
          <h3 className="sec" id="setup-title">
            Setup code for {setup.name}
          </h3>
          <p className="meta">
            Confirm this is really {setup.name}, by phone or in person, before you hand over this
            code. They&apos;ll use it on the &apos;I have a setup code&apos; screen to set their own
            password. It works once{ends(setup.endsAt)}. It is shown only now.
          </p>
          <p className="name">{setup.code}</p>
          <button type="button" onClick={() => setSetups(popSetup)}>
            {setups.length > 1 ? "Done, show the next code" : "Done, hide the code"}
          </button>
          {setups.length > 1 && (
            <p className="meta" role="status">
              {setups.length - 1} more {setups.length === 2 ? "code is" : "codes are"} waiting.
            </p>
          )}
        </section>
      )}
      <section className="card">
        <h3 className="sec">Let staff find our schools</h3>
        <p className="meta">
          When this is on, new staff can search for your schools when they sign up. You still
          approve every person.
        </p>
        <div className="actions">
          <button
            type="button"
            aria-pressed={listed === true}
            onClick={() => void pickListing(true)}
          >
            Let staff find our schools when signing up
          </button>
          <button
            type="button"
            aria-pressed={listed === false}
            onClick={() => void pickListing(false)}
          >
            Turn off school search
          </button>
        </div>
        {listed !== null && (
          <p className="saved" role="status">
            {listed ? "School search is on." : "School search is off."}
          </p>
        )}
      </section>
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
            emailDomainMatched: p.emailDomainMatched,
          }))}
          actions={actions(setNotice, (id, code, endsAt) => {
            const person = people.find((x) => x.id === id);
            setSetups((q) =>
              pushSetup(q, { name: person?.displayName ?? "this person", code, endsAt }),
            );
          })}
          onChanged={() => void load()}
        />
      )}
    </>
  );
}
