/** Accessibility statement. Only says what the automated browser tests check; anything not tested is left out. */
export function Accessibility() {
  return (
    <>
      <h2 className="page-title">Accessibility</h2>
      <section className="card">
        <h3 className="sec">What is checked</h3>
        <p className="meta">
          These are checked by automated tests each time the app changes. They are not a full audit.
        </p>
        <ul className="meta">
          <li>
            You can reach every screen with the keyboard, and Skip to content is the first stop.
          </li>
          <li>Moving to another tab puts focus on that screen's heading and names the page.</li>
          <li>Every button and field has a name a screen reader can read.</li>
          <li>The tab you are on is marked as current, and saving a session is announced.</li>
          <li>
            On a phone, and with larger text, the page does not scroll sideways or hide behind the
            tab bar.
          </li>
          <li>The same holds at common desktop widths.</li>
        </ul>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">What is not checked</h3>
        <p>
          Not every screen has been tried with every screen reader, and color contrast has not been
          audited by a specialist. If something does not work for you, please say so.
        </p>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">Report a problem</h3>
        <p>Tell your case manager first, then the director.</p>
        <p className="meta">
          Placeholder wording: this line will be replaced when the first-day guide is final.
        </p>
      </section>
      <p className="meta">
        <a href="#/help">Help</a>
      </p>
    </>
  );
}
