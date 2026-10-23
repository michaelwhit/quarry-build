/** What a person sees after signing up: nothing else is open to them until the director approves. */
export function Waiting(props: { email: string; onSetupCode: () => void; onBack: () => void }) {
  return (
    <main id="main" className="signin waiting">
      <img className="waiting-logo" src="icon.svg" alt="" width="64" height="64" />
      <h2 className="page-title">Waiting for approval</h2>
      <p>
        Your director will check your request. Once approved, they&apos;ll give you a setup code in
        person. Use it to set your password and your authenticator.
      </p>
      {props.email.trim() !== "" && (
        <p className="meta" data-testid="waiting-account">
          Signed up as {props.email.trim()}
        </p>
      )}
      <button type="button" className="save signin-main" onClick={props.onSetupCode}>
        I have a setup code
      </button>
      <button type="button" className="signin-main" onClick={props.onBack}>
        Back to sign in
      </button>
    </main>
  );
}
