import { useState } from "react";
import { type RoleId, ROLES, agreeToPrivacy, roleById, setRole } from "../data/roles.ts";

/** First screen when signed out: logo, name, slogan and one Sign in button. */
export function SignIn() {
  const [step, setStep] = useState<"landing" | "pick">("landing");
  if (step === "landing")
    return (
      <main id="main" className="signin landing">
        <img className="landing-logo" src="icon.svg" alt="" width="160" height="160" />
        <h2 className="landing-name">GoalLine</h2>
        <p className="landing-slogan">Made by SPED staff for SPED staff</p>
        <p className="landing-affil">Not affiliated with any school district or state agency.</p>
        <button
          type="button"
          className="save signin-main"
          autoFocus
          onClick={() => setStep("pick")}
        >
          Sign in
        </button>
        <a className="btn tour-link" href="tour/">
          See how it works
        </a>
      </main>
    );
  return <PracticePeople onBack={() => setStep("landing")} />;
}

/** Practice sign-in: choose a made-up staff role. Nothing is sent anywhere. */
function PracticePeople({ onBack }: { onBack: () => void }) {
  return (
    <main id="main" className="signin">
      <button type="button" onClick={onBack}>
        ‹ Back
      </button>
      <h2 className="page-title">Practice: sign in as a sample user</h2>
      <p className="meta">Practice data only. Not for real students. Pick who is signing in.</p>
      <p className="form-warn" role="note">
        Practice data only: never enter real students. No account or password, and nothing leaves
        this browser. Hiding what a role cannot see is for display only.
      </p>
      <button type="button" className="save signin-main" onClick={() => setRole("sped_director")}>
        Continue as the director
      </button>
      <h3 className="sec">Or sign in as</h3>
      <ul className="pick">
        {ROLES.filter((r) => r.id !== "sped_director").map((r) => (
          <li key={r.id}>
            <button type="button" className="pick-btn" onClick={() => setRole(r.id)}>
              <strong>{r.person}</strong>
              <span className="meta">{r.label}</span>
              <span aria-hidden="true" className="chev">
                ›
              </span>
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
