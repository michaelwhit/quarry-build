/** Help: what the app does, what it does not do, and who to ask. Plain words, no claims about security or review. */
export function Help() {
  return (
    <>
      <h2 className="page-title">Help</h2>
      <section className="card">
        <h3 className="sec">What GoalLine does</h3>
        <ul className="meta">
          <li>Keeps goal data in one place: tap a score during a session and see the graph.</li>
          <li>Drafts goal and accommodation wording from sample libraries you can edit.</li>
          <li>Shows what is due, so reports and meetings are not missed.</li>
          <li>Shows each person only the screens that fit their role.</li>
        </ul>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">What it does not do</h3>
        <ul className="meta">
          <li>It does not file anything in SRS. SRS stays the official record.</li>
          <li>It does not send anything to anyone for you.</li>
          <li>It does not decide anything for the IEP team. You and the team decide.</li>
        </ul>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">Who to ask</h3>
        <p>Ask your case manager first. If they cannot help, ask the director.</p>
        <p className="meta">
          Placeholder wording: this line will be replaced when the first-day guide is final.
        </p>
      </section>
    </>
  );
}
