import { useState } from "react";
import { type TourStep, pageText } from "../data/pageText.ts";

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

export const TOUR_STEPS: readonly TourStep[] = pageText().tour.steps;

/** A short, skippable card on Home. It never blocks anything and shows once per browser. */
export function FirstRunTour() {
  const [open, setOpen] = useState(() => !tourSeen());
  const [step, setStep] = useState(0);
  const t = pageText().tour;
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
        {t.title}
      </h3>
      <p className="meta" role="status">
        {t.stepOf(step + 1, TOUR_STEPS.length)}: <strong>{s.title}</strong>. {s.text}
      </p>
      <div className="actions stack">
        <a className="btn" href={s.href} onClick={close}>
          {t.show}
        </a>
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)}>
            {t.back}
          </button>
        )}
        {last ? (
          <button type="button" className="save" onClick={close}>
            {t.done}
          </button>
        ) : (
          <button type="button" onClick={() => setStep(step + 1)}>
            {t.next}
          </button>
        )}
        <button type="button" onClick={close}>
          {t.skip}
        </button>
      </div>
    </section>
  );
}
