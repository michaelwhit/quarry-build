import { useSyncExternalStore } from "react";
import { displayName, studentById } from "../data/district.ts";
import { getRole, getRoleVersion, subscribeRole } from "../data/roles.ts";
import { getVersion, subscribe } from "../data/workspace.ts";
import { canUsePresentLevels } from "./PresentLevels.tsx";
import { Form } from "./srs/services.tsx";

// Same people who can write present levels may keep a student's services (practice data only).
export const canUseServices = canUsePresentLevels;

export function Services({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  useSyncExternalStore(subscribeRole, getRoleVersion, getRoleVersion);
  const s = studentById(studentId);
  if (!canUseServices(getRole()))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">
          Sign in as the director, a case manager or a related-service provider to edit services.
        </p>
      </>
    );
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  return (
    <>
      <a className="btn back" href={`#/student/${studentId}`}>
        ← {displayName(s.student)}
      </a>
      <h2 className="page-title">Services</h2>
      <p>
        Special education services, related services, supports for school personnel and
        accommodations. Frequency must be a count or a condition, not &quot;as needed&quot;.
      </p>
      <Form studentId={studentId} />
    </>
  );
}
