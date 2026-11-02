import { pageText } from "../data/pageText.ts";

/** Accessibility statement. Only says what the automated browser tests check; anything not tested is left out. */
export function Accessibility() {
  const t = pageText().accessibility;
  return (
    <>
      <h2 className="page-title">{t.title}</h2>
      <section className="card">
        <h3 className="sec">{t.checkedTitle}</h3>
        <p className="meta">{t.checkedIntro}</p>
        <ul className="meta">
          {t.checked.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">{t.notCheckedTitle}</h3>
        <p>{t.notChecked}</p>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h3 className="sec">{t.reportTitle}</h3>
        <p>{t.report}</p>
        <p className="meta">{t.placeholder}</p>
      </section>
      <p className="meta">
        <a href="#/help">{t.helpLink}</a>
      </p>
    </>
  );
}
