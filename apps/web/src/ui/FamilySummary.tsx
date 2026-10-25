import { useState, useSyncExternalStore } from "react";
import { studentById } from "../data/district.ts";
import {
  type FamilySummary as Summary,
  type Lang,
  familySummary,
  summaryText,
} from "../data/parentSummary.ts";
import { PERIODS, defaultPeriod } from "../data/reports.ts";
import { getRole, getRoleVersion, subscribeRole } from "../data/roles.ts";
import { canUseReports } from "./ProgressReport.tsx";
import "./familySummary.css";

// A page for a family: the teacher picks the language and period, reads it, ticks that it is
// right, and only then can it be copied or printed. Nothing is sent from the app. The Spanish is a
// fixed set of phrases that a bilingual reviewer checks; the goal wording stays as written.

/** The line under the buttons that says why Copy and Print are off, or that they are ready. */
export const actionHint = (goalCount: number, approved: boolean): string =>
  goalCount === 0
    ? "Add a goal before making a summary for the family."
    : approved
      ? "Ready to copy or print."
      : "Copy and Print turn on after you tick the box.";

/** The page a family would read: what is printed or copied. */
export function FamilyPreview({ summary }: { summary: Summary }) {
  return (
    <article className="family-summary" lang={summary.lang}>
      <h3>{summary.title}</h3>
      <p>{summary.period}</p>
      {summary.goals.length === 0 && <p className="empty">{summary.noGoals}</p>}
      {summary.goals.map((g, i) => (
        <section key={i}>
          <h4>{g.area}</h4>
          <p>
            {g.goalWording}: {g.statement}
          </p>
          {g.note && <p>{g.note}</p>}
          {g.progress && <p>{g.progress}</p>}
          <p>{g.status}</p>
        </section>
      ))}
      <p>{summary.next}</p>
    </article>
  );
}

export function FamilySummary({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeRole, getRoleVersion);
  const [lang, setLang] = useState<Lang>("en");
  const [periodId, setPeriodId] = useState(() => defaultPeriod().id);
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [reset, setReset] = useState(false);
  const role = getRole();
  const s = studentById(studentId);
  if (!canUseReports(role))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">Sign in as the director or a case manager to make a family summary.</p>
      </>
    );
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[0]!;
  const summary = familySummary(s.student, s.goals, period, lang);
  // Changing what is shown means the teacher has to read it again.
  const change = (fn: () => void) => {
    fn();
    setReset(approved);
    setApproved(false);
    setCopied("idle");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(summary));
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };
  return (
    <>
      <a href={`#/student/${studentId}`}>← Back to student</a>
      <h2 className="page-title">Family summary</h2>
      <div className="family-controls">
        <label>
          Language{" "}
          <select value={lang} onChange={(e) => change(() => setLang(e.target.value as Lang))}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>{" "}
        <label>
          Period{" "}
          <select value={periodId} onChange={(e) => change(() => setPeriodId(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lang === "es" && (
        <p className="family-note">
          The Spanish wording is a draft. Have a bilingual staff member read it before it goes to a
          family.
        </p>
      )}
      <FamilyPreview summary={summary} />
      <div className="family-actions">
        <label>
          <input
            type="checkbox"
            checked={approved}
            disabled={summary.goals.length === 0}
            aria-describedby="family-hint"
            onChange={(e) => {
              setApproved(e.target.checked);
              setReset(false);
            }}
          />{" "}
          I read this and it is right to share with the family
        </label>{" "}
        <button type="button" className="btn" disabled={!approved} onClick={copy}>
          {copied === "done" ? "Copied" : copied === "failed" ? "Could not copy" : "Copy text"}
        </button>{" "}
        <button type="button" className="btn" disabled={!approved} onClick={() => window.print()}>
          Print
        </button>
        <p id="family-hint" className="meta">
          {actionHint(summary.goals.length, approved)}
        </p>
        <p className="sr-only" role="status">
          {copied === "done"
            ? "Summary copied"
            : copied === "failed"
              ? "Could not copy"
              : reset
                ? "The summary changed. Read it again and tick the box to copy or print."
                : ""}
        </p>
      </div>
    </>
  );
}
