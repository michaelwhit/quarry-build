import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { setPassword, signIn, signUp } from "./client.ts";
import type { Outcome } from "./client.ts";
import { restore, begin } from "./session.ts";
import { NO_SERVER } from "./messages.ts";

const RULES =
  "At least 14 characters. A few unrelated words together work well. Not a common or breached password, and not your name, your email, or GoalLine.";

type Mode = "signin" | "setpw" | "signup" | "waiting";

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password";
  autoComplete: string;
  hint?: string | undefined;
}) {
  const [shown, setShown] = useState(false);
  const secret = props.type === "password";
  return (
    <label>
      <span>{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        type={secret && shown ? "text" : (props.type ?? "text")}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      {secret && (
        <button type="button" onClick={() => setShown(!shown)} aria-pressed={shown}>
          {shown ? "Hide password" : "Show password"}
        </button>
      )}
      {props.hint && <span>{props.hint}</span>}
    </label>
  );
}

function Errors({ out }: { out: Outcome | null }) {
  if (out?.kind !== "error") return null;
  return (
    <div className="form-error" role="alert">
      <p>{out.message}</p>
      {out.lines.length > 0 && (
        <ul>
          {out.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Email and password, the one-time-code screen, and sign-up with an invite code. */
export function AuthPanel({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPw] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);

  const go = (m: Mode) => {
    setMode(m);
    setOut(null);
    setPw("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res =
      mode === "signin"
        ? await signIn(email, password)
        : mode === "setpw"
          ? await setPassword(email, code, password)
          : await signUp(code, email, name, password);
    setBusy(false);
    setPw("");
    if (res.kind === "signed_in") begin(res.me);
    else if (res.kind === "pending") setMode("waiting");
    else setOut(res);
  };

  if (mode === "waiting")
    return (
      <main id="main" className="signin">
        <h2 className="page-title">Thanks. Waiting for approval</h2>
        <p>Your director will let you know when you can sign in.</p>
        <button type="button" className="save signin-main" onClick={() => go("signin")}>
          Back to sign in
        </button>
      </main>
    );

  const title =
    mode === "signin"
      ? "Sign in"
      : mode === "setpw"
        ? "Set your password"
        : "Sign up with an invite code";
  const newPw = mode !== "signin";
  return (
    <main id="main" className="signin">
      <button type="button" onClick={onBack}>
        ‹ Back
      </button>
      <h2 className="page-title">{title}</h2>
      <form className="form" onSubmit={(e) => void submit(e)}>
        {mode === "signup" && (
          <>
            <Field
              label="Invite code"
              value={code}
              onChange={setCode}
              autoComplete="one-time-code"
            />
            <Field label="Your name" value={name} onChange={setName} autoComplete="name" />
          </>
        )}
        {mode === "setpw" && (
          <Field
            label="One-time code from your director"
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
          />
        )}
        <Field
          label="Work email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="username"
        />
        <Field
          label={newPw ? "New password" : "Password"}
          value={password}
          onChange={setPw}
          type="password"
          autoComplete={newPw ? "new-password" : "current-password"}
          hint={newPw ? RULES : undefined}
        />
        <Errors out={out} />
        <button type="submit" className="save signin-main" disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Request access" : title}
        </button>
      </form>
      {mode !== "signin" && (
        <button type="button" onClick={() => go("signin")}>
          I already have a password
        </button>
      )}
      {mode !== "signup" && (
        <button type="button" onClick={() => go("signup")}>
          I have an invite code
        </button>
      )}
      {mode !== "setpw" && (
        <button type="button" onClick={() => go("setpw")}>
          I have a one-time code
        </button>
      )}
    </main>
  );
}

/** Runs once when the page opens: a live session cookie signs the person straight in. */
export function SessionCheck() {
  const [state, setState] = useState<"checking" | "none" | "no_server">("checking");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setState("checking");
    void restore().then((r) => {
      if (live) setState(r === "no_server" ? "no_server" : "none");
    });
    return () => {
      live = false;
    };
  }, [tries]);
  if (state === "checking")
    return (
      <p className="meta" role="status">
        Checking your sign-in…
      </p>
    );
  if (state === "no_server")
    return (
      <div className="form-error" role="alert">
        <p>{NO_SERVER}</p>
        <button type="button" onClick={() => setTries(tries + 1)}>
          Try again
        </button>
      </div>
    );
  return null;
}
