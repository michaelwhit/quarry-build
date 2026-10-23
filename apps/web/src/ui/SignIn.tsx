import { lazy, Suspense, useState } from "react";
import { type RoleId, ROLES, agreeToPrivacy, roleById, setRole } from "../data/roles.ts";

// Real sign-in exists only in a build made with a sign-in server address (VITE_GOALLINE_API_ORIGIN).
// In every other build these are null, so the bundler drops the auth code and the practice picker is all there is.
const AuthPanel = import.meta.env.VITE_GOALLINE_API_ORIGIN
  ? lazy(() => import("../auth/AuthPanel.tsx").then((m) => ({ default: m.AuthPanel })))
  : null;
const SessionCheck = import.meta.env.VITE_GOALLINE_API_ORIGIN
  ? lazy(() => import("../auth/AuthPanel.tsx").then((m) => ({ default: m.SessionCheck })))
  : null;

/**
 * First screen when signed out: logo, name, slogan and a Sign in button. A build with a sign-in
 * server also has a Sign up button; the practice build has no accounts, so it has none.
 */
export function SignIn() {
  const [step, setStep] = useState<"landing" | "pick" | "signup">("landing");
  if (step === "landing")
    return (
      <main id="main" className="signin landing">
        <img className="landing-logo" src="icon.svg" alt="" width="160" height="160" />
        <h2 className="landing-name">GoalLine</h2>
        <p className="landing-slogan">Made by SPED staff for SPED staff</p>
        <p className="landing-affil">Not affiliated with any school district or state agency.</p>
        {SessionCheck && (
          <Suspense fallback={null}>
            <SessionCheck />
          </Suspense>
        )}
        <button
          type="button"
          className="save signin-main"
          autoFocus
          onClick={() => setStep("pick")}
        >
          Sign in
        </button>
        {AuthPanel && (
          <>
            <button type="button" className="signin-main alt" onClick={() => setStep("signup")}>
              Sign up
            </button>
            <p className="meta landing-new">New here? Sign up. Your director will approve you.</p>
          </>
        )}
        <a className="btn tour-link" href="tour/">
          See how it works
        </a>
      </main>
    );
  if (AuthPanel)
    return (
      <Suspense fallback={null}>
        <AuthPanel
          start={step === "signup" ? "signup" : "signin"}
          onBack={() => setStep("landing")}
        />
      </Suspense>
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

/** The student-privacy points, the same as the native app's acknowledgment page. Proposed wording. */
export const PRIVACY_POINTS = [
  "What you see here about students is private. Share it only with the staff who work with that student.",
  "Do not take photos, screenshots or notes of student information off this device.",
  "Do not share your sign-in with anyone. Sign out when you step away.",
  "Tell your case manager right away if a device is lost or you see something you should not.",
  "You can only see the goals your case manager has given you. If you need more, ask them.",
];

/** First sign-in for paras and gen-ed teachers. The wording is proposed, not final. */
export function Privacy({ role }: { role: RoleId }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <main id="main" className="signin">
      <p className="eyebrow">Practice only · Proposed wording</p>
      <h2 className="page-title">Student privacy</h2>
      <p className="meta">
        Signing in as {roleById(role)?.label.toLowerCase()}. Proposed wording. Not final until the
        district approves it.
      </p>
      <ul className="privacy-points">
        {PRIVACY_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <label className="privacy-check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I have read this and I agree.</span>
      </label>
      <div className="actions">
        <button
          type="button"
          className="save"
          disabled={!agreed}
          onClick={() => agreeToPrivacy(role)}
        >
          I agree, continue
        </button>
        <button type="button" onClick={() => setRole(null)}>
          I do not agree
        </button>
      </div>
    </main>
  );
}
