import { useSyncExternalStore } from "react";
import { teamFor } from "../data/team.ts";
import { getRole, getRoleVersion, subscribeRole } from "../data/roles.ts";

/** Who is on a student's team. Read only. Paras do not see staff names on a student page. */
export function TeamSection({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeRole, getRoleVersion, getRoleVersion);
  if (getRole() === "paraprofessional") return null;
  const team = teamFor(studentId);
  return (
    <section className="goal" aria-label="Team">
      <h3>Team</h3>
      {team.length === 0 ? (
        <p className="empty">No team listed yet.</p>
      ) : (
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
    </section>
  );
}
