import { useState } from "react";

/** Remembered per browser. It holds no student data, so it is not a practice key. */
export const TOUR_SEEN_KEY = "goalline-tour-seen";

export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // Storage can be blocked; the card then shows again next visit, which is harmless.
  }
}

export const TOUR_STEPS: readonly { title: string; text: string; href: string }[] = [
  {
    title: "Today",
    text: "Today lists the goals to work on and the sessions to run. Start a session from here.",
    href: "#/today",
  },
  {
    title: "Record data",
    text: "Pick a student and a goal, tap a score for each try, and save. The graph updates right away.",
    href: "#/track",
  },
  {
    title: "Caseload",
    text: "Caseload shows each student, their goals and whether they are on track.",
    href: "#/caseload",
  },
  {
    title: "Libraries",
    text: "Libraries holds sample goal and accommodation wording you can edit and add to a student.",
    href: "#/libraries",
  },
];

/** A short, skippable card on Home. It never blocks anything and shows once per browser. */
export function FirstRunTour() {
  const [open, setOpen] = useState(() => !tourSeen());
  const [step, setStep] = useState(0);
  const s = TOUR_STEPS[step];
  if (!open || !s) return null;
  const last = step === TOUR_STEPS.length - 1;
  const close = () => {
    markTourSeen();
    setOpen(false);
  };
  return (
    <section className="card" aria-labelledby="tour-title" style={{ marginTop: 12 }}>
      <h3 className="sec" id="tour-title">
        A quick look around
      </h3>
      <p className="meta" role="status">
        Step {step + 1} of {TOUR_STEPS.length}: <strong>{s.title}</strong>. {s.text}
      </p>
      <div className="actions stack">
        <a className="btn" href={s.href} onClick={close}>
          Show me
        </a>
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {last ? (
          <button type="button" className="save" onClick={close}>
            Done
          </button>
        ) : (
          <button type="button" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
        <button type="button" onClick={close}>
          Skip the tour
        </button>
      </div>
    </section>
  );
}
