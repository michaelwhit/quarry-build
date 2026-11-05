import { useEffect, useState } from "react";
import { listSignups } from "./client.ts";

/** The words on the card. Plain, no claims about security or review. */
export const SETUP_TEXT = {
  title: "Waiting for your approval",
  one: "1 person asked to join and is waiting for you.",
  many: (n: number) => `${n} people asked to join and are waiting for you.`,
  open: "Review who is waiting",
};

/** Nothing shows when no one is waiting, so the card goes away on its own. */
export function SetupCardView({ waiting }: { waiting: number }) {
  if (waiting < 1) return null;
  return (
    <section className="card" aria-labelledby="setup-card-title" style={{ marginTop: 12 }}>
      <h3 className="sec" id="setup-card-title">
        {SETUP_TEXT.title}
      </h3>
      <p className="meta" role="status">
        {waiting === 1 ? SETUP_TEXT.one : SETUP_TEXT.many(waiting)}
      </p>
      <a className="btn" href="#/staff">
        {SETUP_TEXT.open}
      </a>
    </section>
  );
}

/**
 * Director Home only. It asks the server who is waiting (the same call the Staff page makes) and
 * keeps nothing: no names, no emails, no codes, nothing in the browser. If the server cannot be
 * reached or does not answer, the card says nothing.
 */
export function SetupCard() {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let live = true;
    void listSignups().then((r) => {
      if (live && r.ok) setWaiting(r.value.length);
    });
    return () => {
      live = false;
    };
  }, []);
  return <SetupCardView waiting={waiting} />;
}
