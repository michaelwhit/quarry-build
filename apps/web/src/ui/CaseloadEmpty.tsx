import { can, getRole, type RoleId } from "../data/roles.ts";
import { loadSampleAsOf } from "../data/workspace.ts";

/** What an empty caseload says and offers, by role. Pure so it can be tested. */
export function emptyCaseload(role: RoleId | null): {
  message: string;
  add: boolean;
  sample: boolean;
} {
  if (can(role, "addStudent")) {
    return {
      message: "No students yet. Start with a made-up student, or load the sample students.",
      add: true,
      sample: can(role, "manageData"),
    };
  }
  return {
    message:
      role === "related_service_provider"
        ? "No students are marked as served by you yet. Ask the director to mark the students you serve."
        : "No students are shared with this role yet. Sign in as the director or a case manager to share some.",
    add: false,
    sample: false,
  };
}

/** Shown in place of the caseload cards when the list is empty. */
export function CaseloadEmpty() {
  const e = emptyCaseload(getRole());
  return (
    <div className="card empty-start">
      <p className="empty">{e.message}</p>
      {(e.add || e.sample) && (
        <div className="actions">
          {e.add && (
            <>
              <a className="btn save" href="#/add-student">
                Add a student
              </a>
              <a className="btn" href="#/import-students">
                Import students
              </a>
            </>
          )}
          {e.sample && (
            <button type="button" onClick={() => loadSampleAsOf()}>
              Load sample students
            </button>
          )}
        </div>
      )}
    </div>
  );
}
