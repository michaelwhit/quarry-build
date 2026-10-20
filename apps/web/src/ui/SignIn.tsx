import { type RoleId, ROLES, agreeToPrivacy, roleById, setRole } from "../data/roles.ts";

/** Practice sign-in: choose a made-up staff role. Nothing is sent anywhere. */
export function SignIn() {
  return (
    <main id="main" className="signin">
      <p className="eyebrow">Practice sign-in, not a real account</p>
      <h2 className="page-title">Who are you signing in as?</h2>
      <p className="form-warn" role="note">
        Pick a made-up staff role to see what that role would see. No account, no password, and
        nothing leaves this browser.
        <br />
        Hiding what a role cannot see is for display only: all the practice data sits in this
        browser, so never enter real students.
      </p>
      <ul className="pick">
        {ROLES.map((r) => (
          <li key={r.id}>
            <button type="button" className="pick-btn" onClick={() => setRole(r.id)}>
              <strong>{r.label}</strong>
              <span>{r.person}</span>
              <span className="meta">{r.sees}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** First sign-in for paras and gen-ed teachers. The wording is proposed, not final. */
export function Privacy({ role }: { role: RoleId }) {
  return (
    <main id="main" className="signin">
      <p className="eyebrow">Practice only · Proposed wording</p>
      <h2 className="page-title">Student privacy</h2>
      <p>
        You are signing in as {roleById(role)?.label.toLowerCase()}. Student information is
        confidential. Use it only for the students and goals shared with you, do not share it, and
        do not take photos or notes of it outside the app.
      </p>
      <div className="actions">
        <button type="button" className="save" onClick={() => agreeToPrivacy(role)}>
          I agree, continue
        </button>
        <button type="button" onClick={() => setRole(null)}>
          I do not agree
        </button>
      </div>
    </main>
  );
}
