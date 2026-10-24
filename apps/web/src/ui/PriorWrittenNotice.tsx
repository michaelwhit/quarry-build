import { useState, useSyncExternalStore } from "react";
import { getConsiderationsVersion, subscribeConsiderations } from "../data/considerations.ts";
import { displayName, studentById } from "../data/district.ts";
import { getIepShortVersion, subscribeIepShort } from "../data/iepShort.ts";
import { getPlVersion, subscribePl } from "../data/presentLevels.ts";
import { type BoxId, type RowChange, copyText, dateText, draftPwn } from "../data/pwn.ts";
import { gatherPwn } from "../data/pwnSources.ts";
import {
  CHANGES,
  approveBox,
  getPwnEntry,
  getPwnVersion,
  isApproved,
  setPwnEntry,
  subscribePwn,
} from "../data/pwnStore.ts";
import { getRole, getRoleVersion, subscribeRole } from "../data/roles.ts";
import { getServices, getServicesVersion, subscribeServices } from "../data/serviceRows.ts";
import { canUsePresentLevels } from "./PresentLevels.tsx";

// The Prior Written Notice draft (practice data only). Code builds every box from the other IEP
// sections and the entries typed here; no model writes any of it. The teacher approves each box,
// then copies it into the record system by hand. Nothing is sent anywhere.

export const canUsePwn = canUsePresentLevels;

const CHANGE_WORDS: Record<RowChange, string> = {
  added: "Added",
  changed: "Changed",
  unchanged: "Not changed",
  removed: "Removed",
};

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function CopyButton({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("failed");
        }
        window.setTimeout(() => setState("idle"), 3000);
      }}
    >
      {state === "done" ? "Copied" : state === "failed" ? "Could not copy" : `Copy ${label}`}
    </button>
  );
}

export function PriorWrittenNotice({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribePwn, getPwnVersion, getPwnVersion);
  useSyncExternalStore(subscribePl, getPlVersion, getPlVersion);
  useSyncExternalStore(subscribeServices, getServicesVersion, getServicesVersion);
  useSyncExternalStore(subscribeConsiderations, getConsiderationsVersion, getConsiderationsVersion);
  useSyncExternalStore(subscribeIepShort, getIepShortVersion, getIepShortVersion);
  useSyncExternalStore(subscribeRole, getRoleVersion, getRoleVersion);
  const s = studentById(studentId);
  if (!canUsePwn(getRole()))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">Sign in as the director, a case manager or a provider.</p>
      </>
    );
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );

  const entry = getPwnEntry(studentId);
  const { input, missing } = gatherPwn(studentId);
  const draft = draftPwn(input);
  const set = (patch: Parameters<typeof setPwnEntry>[1]) => setPwnEntry(studentId, patch);
  // Unset rows read as "Added" in the draft, so the picker says so instead of looking chosen.
  const marker = (id: string): RowChange | "" => entry.changes[id] ?? "";
  const markers = [
    ...getServices(studentId).rows.map((r) => ({ id: r.id, name: r.title || "Untitled service" })),
    ...s.goals.map((g, i) => ({
      id: g.goal.id,
      name: `Goal ${i + 1}: ${String(g.goal.area).replaceAll("_", " ")}`,
    })),
  ];

  return (
    <>
      <a className="btn back" href={`#/student/${studentId}`}>
        ← {displayName(s.student)}
      </a>
      <h2 style={{ textTransform: "none", color: "var(--text)", fontSize: "1.4rem" }}>
        Prior Written Notice draft
      </h2>
      <p>
        Each box is written by the app from your IEP entries and what you type here. Read it,
        approve it, then copy it into the record system yourself. Changing any entry clears the
        approvals. Practice data only; nothing is sent anywhere.
      </p>
      {missing.length > 0 && (
        <section className="goal" aria-label="Finish first">
          <h3>Finish first</h3>
          <ul>
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="goal" aria-label="Your entries">
        <h3>Your entries</h3>
        <label>
          Date of the notice
          <input
            type="date"
            value={entry.noteDate}
            onChange={(e) => set({ noteDate: e.target.value })}
          />
        </label>
        <label>
          Date it was given to the parent
          <input
            type="date"
            value={entry.deliveryDate}
            onChange={(e) => set({ deliveryDate: e.target.value })}
          />
        </label>
        <label>
          How it was given (the exact choice in the record system)
          <input
            maxLength={200}
            value={entry.deliveryMethod}
            onChange={(e) => set({ deliveryMethod: e.target.value })}
          />
        </label>
        {markers.length > 0 && (
          <fieldset>
            <legend>What this IEP does to each service and goal</legend>
            {markers.map((m) => (
              <label key={m.id}>
                {m.name}
                <select
                  value={marker(m.id)}
                  onChange={(e) =>
                    set({ changes: { ...entry.changes, [m.id]: e.target.value as RowChange } })
                  }
                >
                  {marker(m.id) === "" && (
                    <option value="" disabled>
                      Not chosen (the draft says Added)
                    </option>
                  )}
                  {CHANGES.map((c) => (
                    <option key={c} value={c}>
                      {CHANGE_WORDS[c]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        )}
        <label>
          Why, in your own words (one reason per line)
          <textarea
            key={`${studentId}:${entry.reasons.join("\n")}`}
            rows={3}
            maxLength={2000}
            defaultValue={entry.reasons.join("\n")}
            onBlur={(e) => set({ reasons: lines(e.target.value) })}
          />
        </label>
        <fieldset>
          <legend>Other options the team considered</legend>
          {entry.alternatives.map((a, i) => (
            <div key={i}>
              <label>
                Option {i + 1}
                <input
                  maxLength={500}
                  value={a.option}
                  onChange={(e) =>
                    set({
                      alternatives: entry.alternatives.map((x, j) =>
                        j === i ? { ...x, option: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Why it was not chosen
                <input
                  maxLength={500}
                  value={a.reason}
                  onChange={(e) =>
                    set({
                      alternatives: entry.alternatives.map((x, j) =>
                        j === i ? { ...x, reason: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => set({ alternatives: entry.alternatives.filter((_, j) => j !== i) })}
              >
                Remove option {i + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              set({ alternatives: [...entry.alternatives, { option: "", reason: "" }] })
            }
          >
            Add an option
          </button>
        </fieldset>
        <label>
          Other relevant factors (one per line, optional)
          <textarea
            key={`${studentId}:${entry.otherFactors.join("\n")}`}
            rows={3}
            maxLength={2000}
            defaultValue={entry.otherFactors.join("\n")}
            onBlur={(e) => set({ otherFactors: lines(e.target.value) })}
          />
        </label>
        <fieldset>
          <legend>Contact for questions</legend>
          <label>
            Name
            <input
              maxLength={120}
              value={entry.contact.name}
              onChange={(e) => set({ contact: { ...entry.contact, name: e.target.value } })}
            />
          </label>
          <label>
            Role
            <input
              maxLength={120}
              value={entry.contact.role}
              onChange={(e) => set({ contact: { ...entry.contact, role: e.target.value } })}
            />
          </label>
          <label>
            Phone (optional)
            <input
              maxLength={40}
              value={entry.contact.phone}
              onChange={(e) => set({ contact: { ...entry.contact, phone: e.target.value } })}
            />
          </label>
        </fieldset>
      </section>

      <section className="goal" aria-label="The notice">
        <h3>The notice</h3>
        <p>
          Date of the notice: {dateText(draft.noteDate) || "not entered"}
          <br />
          Date given: {dateText(draft.deliveryDate) || "not entered"}
        </p>
        {draft.deliveryMethod && <p>Pick in the record system: {draft.deliveryMethod}</p>}
      </section>
      {draft.boxes.map((b) => {
        const approved = isApproved(entry, draft, b.id as BoxId);
        const text = copyText(draft, b.id);
        return (
          <section className="goal" key={b.id} aria-label={b.label}>
            <h3>{b.label}</h3>
            {b.text && <p style={{ whiteSpace: "pre-wrap" }}>{b.text}</p>}
            {b.blocked.map((why) => (
              <p key={why} role="note" className="empty">
                {why}
              </p>
            ))}
            {b.blocked.length === 0 && b.text && (
              <p>
                {approved ? (
                  <strong>Approved. Changing any entry clears this.</strong>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => approveBox(studentId, draft, b.id)}
                  >
                    I read this and approve it
                  </button>
                )}
                {approved && text !== null && (
                  <>
                    {" "}
                    <CopyButton label={b.label} text={text} />
                  </>
                )}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
