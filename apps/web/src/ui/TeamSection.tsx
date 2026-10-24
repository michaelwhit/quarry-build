import { useSyncExternalStore } from "react";
import { accessLines } from "../data/teamAccess.ts";
import { teamFor } from "../data/team.ts";
import { getRole, getRoleVersion, subscribeRole } from "../data/roles.ts";
import { getVersion, getWorkspace, subscribe } from "../data/workspace.ts";

/** Who is on a student's team. Read only. Paras do not see staff names on a student page. */
export function TeamSection({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeRole, getRoleVersion, getRoleVersion);
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (getRole() === "paraprofessional") return null;
  const team = teamFor(studentId);
  const access = accessLines(getWorkspace(), studentId);
  return (
    <section className="goal" aria-label="Team">
      <h3>Team</h3>
      {team.length === 0 && access.length === 0 && <p className="empty">No team listed yet.</p>}
      {team.length > 0 && (
        <ul>
          {team.map((m) => (
            <li key={m.id}>
              <strong>{m.name}</strong> · {m.role}
              <br />
              <span className="meta">{m.tie}</span>
            </li>
          ))}
        </ul>
      )}
      {access.length > 0 && (
        <>
          <h4>Also has access</h4>
          <ul>
            {access.map((l) => (
              <li key={l.who}>
                <strong>{l.who}</strong>
                <br />
                <span className="meta">{l.why}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
