import { useState, useSyncExternalStore } from "react";
import { displayName, scrub, studentById, students } from "../data/district.ts";
import { getRole, roleById, subscribeRole, getRoleVersion } from "../data/roles.ts";
import {
  PERIODS,
  STATE_LABEL,
  approve,
  attest,
  dataChanged,
  reopen,
  defaultComment,
  defaultPeriod,
  editGoal,
  effectiveSufficient,
  getRecord,
  getReportsVersion,
  goalKit,
  kitHash,
  type CopyPart,
  markCopied,
  needsReason,
  subscribeReports,
} from "../data/reports.ts";
import { Graph } from "./Graph.tsx";

// Only the director and case managers use this screen (the practice app has no per-student
// case manager assignment, so every case manager can open it).
export const canUseReports = (role: string | null) =>
  role === "sped_director" || role === "case_manager";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const dueText = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function CopyButton({
  text,
  label,
  onCopied,
}: {
  text: string;
  label: string;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const click = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // clipboard blocked: nothing is marked copied
    }
    setState(ok ? "done" : "failed");
    if (ok) onCopied?.();
    window.setTimeout(() => setState("idle"), 3000);
  };
  return (
    <button type="button" className="btn" onClick={click}>
      {state === "done" ? "Copied" : state === "failed" ? "Could not copy" : label}
    </button>
  );
}

/** The students whose report for the next period is not filed yet (Today, case manager). */
export function ReportsDue() {
  useSyncExternalStore(subscribeReports, getReportsVersion);
  const role = getRole();
  if (!canUseReports(role)) return null;
  const period = defaultPeriod();
  const waiting = students.filter(
    (s) => s.goals.length > 0 && getRecord(s.student.id, period.id).state !== "filed_attested",
  );
  if (waiting.length === 0) return null;
  return (
    <>
      <h3 className="sec">
        {waiting.length} progress report{waiting.length === 1 ? "" : "s"} due {dueText(period.due)}
      </h3>
      <ul className="pick">
        {waiting.map((s) => (
          <li key={s.student.id}>
            <a className="pick-btn" href={`#/student/${s.student.id}/report`}>
              <strong>{displayName(s.student)}</strong>
              <span className="meta">{STATE_LABEL[getRecord(s.student.id, period.id).state]}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ProgressReport({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribeReports, getReportsVersion);
  useSyncExternalStore(subscribeRole, getRoleVersion);
  const [periodId, setPeriodId] = useState(() => defaultPeriod().id);
  const [confirming, setConfirming] = useState(false);
  const role = getRole();
  const s = studentById(studentId);
  if (!canUseReports(role))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">Sign in as the director or a case manager to see progress reports.</p>
      </>
    );
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[0]!;
  const rec = getRecord(studentId, period.id);
  const who = roleById(role)?.person ?? "Staff";
  const locked = rec.state !== "not_started" && rec.state !== "drafted";
  const rows = s.goals.map((g, i) => {
    const kit = goalKit(g, period);
    const entry = rec.goals[g.goal.id];
    const liveSufficient = effectiveSufficient(entry, kit);
    const liveComment = entry?.comment ?? defaultComment(s.student, g, kit);
    // After approval the screen and the copy buttons use what was approved.
    const sufficient = locked && entry?.frozen ? entry.frozen.sufficient : liveSufficient;
    const comment = locked && entry?.frozen ? entry.frozen.comment : liveComment;
    const needed: CopyPart[] = comment.trim() ? ["comment", "yesNo"] : ["yesNo"];
    return { g, i, kit, entry, sufficient, comment, needed, liveSufficient, liveComment };
  });
  const hash = kitHash(
    rows.map((r) => ({
      goalId: r.g.goal.id,
      sufficient: r.liveSufficient,
      comment: r.liveComment,
    })),
  );
  // After approval every log row carries the approved hash, not the live one.
  const ctx = { who, hash: rec.approvedHash ?? hash };
  const missingReason = rows.some((r) => needsReason(r.entry, r.kit) && !r.entry?.reason?.trim());
  const allIds = rows.map((r) => r.g.goal.id);
  const copiedCount = rows.filter((r) => r.entry?.copied).length;

  return (
    <>
      <a className="btn back" href={`#/student/${studentId}`}>
        ← {displayName(s.student)}
      </a>
      <h2 style={{ textTransform: "none", color: "var(--text)", fontSize: "1.4rem" }}>
        {period.label} progress report · due {dueText(period.due)}
      </h2>
      <p>
        <strong>{STATE_LABEL[rec.state]}</strong> · {displayName(s.student)}
      </p>
      <label className="check">
        Period{" "}
        <select
          value={period.id}
          onChange={(e) => {
            setPeriodId(e.target.value);
            setConfirming(false);
          }}
        >
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} (due {dueText(p.due)})
            </option>
          ))}
        </select>
      </label>
      {rows.length === 0 && <p className="empty">No goals yet.</p>}
      {rows.map(({ g, i, kit, entry, sufficient, comment, needed }) => (
        <section className="goal" key={g.goal.id} aria-label={`Goal ${i + 1}`}>
          <h3>Goal {i + 1}</h3>
          <p>{g.goal.statement}</p>
          {kit.sessions === 0 ? (
            <p className="empty">
              No data collected this period.{" "}
              <a href={`#/track/${studentId}/${g.goal.id}`}>Record a session</a>
            </p>
          ) : (
            <>
              <p>
                Baseline {Math.round((kit.baseline ?? 0) * 10) / 10}
                {kit.unit} · latest {Math.round((kit.latest ?? 0) * 10) / 10}
                {kit.unit} · aim {kit.aim}
                {kit.unit} · {kit.sessions} sessions, {kit.from} to {kit.to}
              </p>
              <Graph
                series={kit.series}
                target={kit.aim}
                label={`Goal ${i + 1} this period`}
                unit={g.plan.unit ?? g.plan.type.replaceAll("_", " ")}
              />
            </>
          )}
          <fieldset disabled={locked}>
            <legend>Sufficient progress</legend>
            {[true, false].map((v) => (
              <label className="check" key={String(v)}>
                <input
                  type="radio"
                  name={`suff-${g.goal.id}`}
                  checked={sufficient === v}
                  disabled={kit.computed === null && v}
                  onChange={() => editGoal(rec, g.goal.id, { sufficient: v }, ctx)}
                />
                {v ? "Yes" : "No"}
              </label>
            ))}
            <p style={{ color: "var(--text-muted)" }}>
              {kit.computed === null ? "No data, so this stays No." : "Prefilled from your data."}
            </p>
            {needsReason(entry, kit) && (
              <label>
                Why is this different from the numbers? (one line)
                <input
                  type="text"
                  maxLength={200}
                  value={entry?.reason ?? ""}
                  onChange={(e) => editGoal(rec, g.goal.id, { reason: e.target.value }, ctx)}
                />
              </label>
            )}
            <label>
              Comment
              <textarea
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={(e) => editGoal(rec, g.goal.id, { comment: e.target.value }, ctx)}
              />
            </label>
          </fieldset>
          {(rec.state === "approved" || rec.state === "copied") && (
            <p>
              {needed.includes("comment") && (
                <CopyButton
                  label="Copy comment"
                  text={scrub(comment, s.student)}
                  onCopied={() => markCopied(rec, g.goal.id, i + 1, allIds, "comment", needed, ctx)}
                />
              )}{" "}
              <CopyButton
                label="Copy Yes/No"
                text={sufficient ? "Yes" : "No"}
                onCopied={() => markCopied(rec, g.goal.id, i + 1, allIds, "yesNo", needed, ctx)}
              />{" "}
              {entry?.copied ? "✓ copied" : ""}
            </p>
          )}
        </section>
      ))}

      {dataChanged(rec, hash) && (
        <p role="alert">
          New data was recorded after you approved. Copy buttons use the approved text.{" "}
          <button type="button" className="btn" onClick={() => reopen(rec, ctx)}>
            Update from new data
          </button>
        </p>
      )}
      <section aria-label="Next step">
        {(rec.state === "not_started" || rec.state === "drafted") && (
          <>
            <button
              type="button"
              className="btn"
              disabled={missingReason || rows.length === 0}
              onClick={() =>
                approve(
                  rec,
                  rows.map((r) => ({
                    goalId: r.g.goal.id,
                    sufficient: r.liveSufficient,
                    comment: r.liveComment,
                  })),
                  ctx,
                )
              }
            >
              Approve
            </button>
            {missingReason && (
              <p className="empty">Add a one-line reason where you changed an answer.</p>
            )}
          </>
        )}
        {(rec.state === "approved" || rec.state === "copied") && (
          <p>
            Copy each goal into SRS: {copiedCount} of {rows.length} copied. The browser keeps copied
            text on the clipboard until you copy something else (the Mac app clears it).
          </p>
        )}
        {rec.state === "copied" &&
          (confirming ? (
            <p>
              <button type="button" className="btn" onClick={() => attest(rec, ctx)}>
                Yes, I filed and finalized this in SRS
              </button>{" "}
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Not yet
              </button>
            </p>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              I filed and finalized this in SRS
            </button>
          ))}
        {rec.state === "filed_attested" && (
          <p>Attested as filed by you; nothing is sent from this app.</p>
        )}
      </section>

      <section aria-label="History">
        <h3>History</h3>
        {rec.log.length === 0 && <p className="empty">Nothing yet.</p>}
        <ul>
          {[...rec.log].reverse().map((r, i) => (
            <li key={`${r.at}-${i}`}>
              {r.text} · {r.who} · {when(r.at)}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
