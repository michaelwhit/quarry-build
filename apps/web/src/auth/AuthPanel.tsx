import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  enrolConfirm,
  enrolStart,
  searchSchools,
  secondFactor,
  setPassword,
  signIn,
  signUp,
  signUpSchool,
} from "./client.ts";
import type { Confirm, Enrol, Me, Outcome, School } from "./client.ts";
import { restore, begin } from "./session.ts";
import { Waiting } from "./Waiting.tsx";
import { NO_SCHOOLS, NO_SERVER, START_OVER, recoveryLeftMessage } from "./messages.ts";

const RULES =
  "At least 14 characters. A few unrelated words together work well. Not a common or breached password, and not your name, your email, or GoalLine.";

type Mode = "signin" | "setpw" | "signup" | "waiting" | "school" | "factor" | "enrol" | "notice";

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

function Errors({ out }: { out: Outcome | Enrol | Confirm | null }) {
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

/** Groups of four, for typing the setup key into an authenticator app by hand. */
export const groupKey = (secret: string) =>
  secret
    .replace(/\s+/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();

/** The six-digit code from the authenticator app, or one recovery code. */
function SecondFactor(props: {
  challenge: string;
  onSignedIn: (me: Me, recoveryLeft?: number) => void;
  onStartOver: (message?: string | null) => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const v = value.trim();
    const res = await secondFactor(
      props.challenge,
      useRecovery ? { recoveryCode: v } : { code: v },
    );
    setBusy(false);
    setValue("");
    if (res.kind === "signed_in") props.onSignedIn(res.me, res.recoveryLeft);
    else setOut(res);
  };
  return (
    <main id="main" className="signin">
      <h2 className="page-title">{useRecovery ? "Use a recovery code" : "Enter your code"}</h2>
      <p>
        {useRecovery
          ? "Type one of the recovery codes you saved. Each works once."
          : "Open your authenticator app and type the 6-digit code for GoalLine."}
      </p>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          <span>{useRecovery ? "Recovery code" : "6-digit code"}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
        </label>
        <Errors out={out} />
        <button type="submit" className="save signin-main" disabled={busy}>
          {busy ? "One moment…" : "Sign in"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setUseRecovery(!useRecovery);
          setValue("");
          setOut(null);
        }}
      >
        {useRecovery ? "Use my authenticator app instead" : "Use a recovery code"}
      </button>
      <button type="button" onClick={() => props.onStartOver(null)}>
        Start again from my password
      </button>
    </main>
  );
}

/** First sign-in: set up the authenticator app, then save the recovery codes once. */
function Enrolment(props: {
  challenge: string;
  onFinished: (me: Me | null, after: string | null) => void;
  onStartOver: (message?: string | null) => void;
}) {
  const [key, setKey] = useState<Enrol | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Confirm | null>(null);
  const [saved, setSaved] = useState<{
    codes: string[];
    me: Me | null;
    after: string | null;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void enrolStart(props.challenge).then((r) => {
      if (!live) return;
      if (r.kind === "expired") props.onStartOver(START_OVER);
      else setKey(r);
    });
    return () => {
      live = false;
    };
    // The challenge never changes while this screen is open.
  }, [props.challenge]);

  if (saved)
    return (
      <main id="main" className="signin">
        <h2 className="page-title">Save your recovery codes</h2>
        <p>
          Save these recovery codes somewhere safe. Each works once if you lose your phone. They are
          shown only now.
        </p>
        <ul className="recovery-codes">
          {saved.codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="save signin-main"
          onClick={() => props.onFinished(saved.me, saved.after)}
        >
          I saved them
        </button>
      </main>
    );

  if (!key)
    return (
      <p className="meta" role="status">
        Setting up your authenticator…
      </p>
    );
  if (key.kind === "error")
    return (
      <main id="main" className="signin">
        <Errors out={key} />
        <button type="button" onClick={() => props.onStartOver(null)}>
          Start again from my password
        </button>
      </main>
    );
  if (key.kind === "expired") return null;

  const grouped = groupKey(key.secret);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await enrolConfirm(props.challenge, code.trim());
    setBusy(false);
    setCode("");
    if (res.kind === "codes") setSaved(res);
    else setOut(res);
  };
  return (
    <main id="main" className="signin">
      <h2 className="page-title">Set up your authenticator app</h2>
      <p>
        Add GoalLine to Google Authenticator, Microsoft Authenticator or 1Password: choose to add an
        account by typing a setup key, and type this one.
      </p>
      <p className="setup-key" aria-label="Setup key">
        <code>{grouped}</code>
      </p>
      {key.otpauthUri.startsWith("otpauth://") && (
        <p>
          On a phone with an authenticator app, you can{" "}
          <a href={key.otpauthUri}>open the setup link</a>.
        </p>
      )}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          <span>6-digit code from the app</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            spellCheck={false}
            required
          />
        </label>
        <Errors out={out} />
        <button type="submit" className="save signin-main" disabled={busy}>
          {busy ? "One moment…" : "Turn on and sign in"}
        </button>
      </form>
      <button type="button" onClick={() => props.onStartOver(null)}>
        Start again from my password
      </button>
    </main>
  );
}

/** Sign-up by picking a school: search after 3 letters, about half a second after the last key. */
function SchoolSignup({
  onPending,
  onBack,
}: {
  onPending: (email: string) => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<School[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);

  useEffect(() => {
    const text = q.trim();
    setSearchError(null);
    if (school || text.length < 3 || text.length > 60) {
      setFound(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void searchSchools(text).then((r) => {
        if (!live) return;
        if (r.ok) setFound(r.schools);
        else {
          setFound(null);
          setSearchError(r.message);
        }
      });
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, school]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !school) return;
    setBusy(true);
    const res = await signUpSchool(school.id, email, name);
    setBusy(false);
    // Every outcome after the checks is the same waiting screen.
    if (res.kind === "pending") onPending(email);
    else setOut(res);
  };

  return (
    <main id="main" className="signin">
      <button type="button" onClick={onBack}>
        ‹ Back
      </button>
      <h2 className="page-title">Sign up with my school</h2>
      <form className="form" onSubmit={(e) => void submit(e)}>
        {school ? (
          <p>
            <strong>{school.name}</strong>
            {school.town ? `, ${school.town}` : ""}
            {school.district ? ` (${school.district})` : ""}{" "}
            <button type="button" onClick={() => setSchool(null)}>
              Change school
            </button>
          </p>
        ) : (
          <>
            <label>
              <span>Your school (type at least 3 letters)</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={60}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            {searchError && (
              <p className="form-error" role="alert">
                {searchError}
              </p>
            )}
            {found && found.length === 0 && <p className="meta">{NO_SCHOOLS}</p>}
            {found && found.length > 0 && (
              <ul className="pick">
                {found.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSchool(s)}>
                      {s.name}
                      {s.town ? `, ${s.town}` : ""}
                      {s.district ? ` (${s.district})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <Field label="Your name" value={name} onChange={setName} autoComplete="name" />
        <Field
          label="Work email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="username"
        />
        <Errors out={out} />
        <button type="submit" className="save signin-main" disabled={busy || !school}>
          {busy ? "One moment…" : "Request access"}
        </button>
      </form>
    </main>
  );
}

/** Email and password, the setup-code screen, and sign-up with an invite code. */
export function AuthPanel({
  onBack,
  start = "signin",
}: {
  onBack: () => void;
  start?: "signin" | "signup";
}) {
  const [mode, setMode] = useState<Mode>(start);
  const [email, setEmail] = useState("");
  const [password, setPw] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [waitingEmail, setWaitingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);
  // Kept in memory only: the step-up challenge, and who is signed in while a notice is read.
  const [challenge, setChallenge] = useState("");
  const [notice, setNotice] = useState<{ me: Me; lines: string[]; after: string | null } | null>(
    null,
  );

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
          : await signUp(code, email, name);
    setBusy(false);
    setPw("");
    if (res.kind === "signed_in") begin(res.me);
    else if (res.kind === "pending") {
      setWaitingEmail(mode === "signup" ? email : "");
      setMode("waiting");
    } else if (res.kind === "second_factor" || res.kind === "enrol") {
      setChallenge(res.challenge);
      setOut(null);
      setMode(res.kind === "enrol" ? "enrol" : "factor");
    } else setOut(res);
  };

  const startOver = (message: string | null = null) => {
    setChallenge("");
    setMode("signin");
    setOut(message ? { kind: "error", message, lines: [] } : null);
  };

  if (mode === "school")
    return (
      <SchoolSignup
        onPending={(who) => {
          setWaitingEmail(who);
          setMode("waiting");
        }}
        onBack={() => go("signin")}
      />
    );
  if (mode === "factor")
    return (
      <SecondFactor
        challenge={challenge}
        onSignedIn={(me, left) => {
          if (left !== undefined && left <= 3) {
            setNotice({ me, lines: [recoveryLeftMessage(left)], after: null });
            setMode("notice");
          } else begin(me);
        }}
        onStartOver={startOver}
      />
    );
  if (mode === "enrol")
    return (
      <Enrolment
        challenge={challenge}
        onFinished={(me, after) => {
          if (me) begin(me);
          else startOver(after);
        }}
        onStartOver={startOver}
      />
    );
  if (mode === "notice" && notice)
    return (
      <main id="main" className="signin">
        <h2 className="page-title">Signed in</h2>
        {notice.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <button type="button" className="save signin-main" onClick={() => begin(notice.me)}>
          Continue
        </button>
      </main>
    );

  if (mode === "waiting")
    return (
      <Waiting email={waitingEmail} onSetupCode={() => go("setpw")} onBack={() => go("signin")} />
    );

  const title =
    mode === "signin"
      ? "Sign in"
      : mode === "setpw"
        ? "Set your password"
        : "Sign up with an invite code";
  const newPw = mode === "setpw";
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
            label="Setup code from your director"
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
        {mode !== "signup" && (
          <Field
            label={newPw ? "New password" : "Password"}
            value={password}
            onChange={setPw}
            type="password"
            autoComplete={newPw ? "new-password" : "current-password"}
            hint={newPw ? RULES : undefined}
          />
        )}
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
      <button type="button" onClick={() => go("school")}>
        Sign up with my school
      </button>
      {mode !== "signup" && (
        <button type="button" onClick={() => go("signup")}>
          I have an invite code
        </button>
      )}
      {mode !== "setpw" && (
        <button type="button" onClick={() => go("setpw")}>
          I have a setup code
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
