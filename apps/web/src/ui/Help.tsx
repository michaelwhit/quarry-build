import { pageText } from "../data/pageText.ts";

/** Help: what the app does, what it does not do, and who to ask. Plain words, no claims about security or review. */
export function Help() {
  const t = pageText().help;
  return (
    <>
      <h2 className="page-title">{t.title}</h2>
      <section className="card">
        <h3 className="sec">{t.doesTitle}</h3>
        <ul className="meta">
          {t.does.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">{t.doesNotTitle}</h3>
        <ul className="meta">
          {t.doesNot.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">{t.askTitle}</h3>
        <p>{t.ask}</p>
        <p className="meta">{t.placeholder}</p>
      </section>
    </>
  );
}
