import { type ComponentType, useState, useSyncExternalStore } from "react";
import { displayName, studentById } from "../data/district.ts";
import { getRole, getRoleVersion, roleById, subscribeRole } from "../data/roles.ts";
import {
  type PacketItem,
  buildPacket,
  getSectionsVersion,
  subscribeSections,
  canMark,
  getPacket,
  getPacketVersion,
  isCopied,
  markCopied,
  sectionState,
  setMarked,
  subscribePacket,
} from "../data/srsPacket.ts";
import { canUsePresentLevels } from "./PresentLevels.tsx";
import { getVersion, subscribe } from "../data/workspace.ts";

// An edit form is a file in src/ui/srs/ that exports `section` and `Form`. The page shows it in
// that section's card.
const FORMS = new Map(
  Object.values(
    import.meta.glob<{ section: string; Form: ComponentType<{ studentId: string }> }>(
      "./srs/*.tsx",
      {
        eager: true,
      },
    ),
  ).map((m) => [m.section, m.Form]),
);

// Same people who can write present levels may build the packet.
export const canUsePacket = canUsePresentLevels;

const STATE_TEXT = {
  not_built: "Not in GoalLine yet. Type this section in SRS.",
  blocked: "Needs attention before you paste",
  empty: "Nothing to paste yet",
  ready: "Ready to paste",
  pasted: "Marked pasted",
  changed: "Changed since you marked it pasted",
} as const;

function CopyRow({
  item,
  copied,
  onCopied,
}: {
  item: PacketItem;
  copied: boolean;
  onCopied: () => void;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const click = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(item.text ?? "");
      ok = true;
    } catch {
      // clipboard blocked: nothing is marked copied
    }
    setState(ok ? "done" : "failed");
    if (ok) onCopied();
    window.setTimeout(() => setState("idle"), 3000);
  };
  return (
    <li>
      <strong>{item.label}</strong>
      {item.text !== undefined && (
        <>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.text}</p>
          <button type="button" className="btn" onClick={click}>
            {state === "done"
              ? "Copied"
              : state === "failed"
                ? "Could not copy"
                : `Copy ${item.label}`}
          </button>{" "}
          {copied ? "✓ copied" : ""}
        </>
      )}
      {item.pick !== undefined && <p>Pick in SRS: {item.pick}</p>}
      {item.blocked !== undefined && (
        <p role="note" className="empty">
          {item.blocked}
        </p>
      )}
    </li>
  );
}

export function SrsPacket({ studentId }: { studentId: string }) {
  useSyncExternalStore(subscribePacket, getPacketVersion, getPacketVersion);
  useSyncExternalStore(subscribeSections, getSectionsVersion, getSectionsVersion);
  useSyncExternalStore(subscribe, getVersion, getVersion);
  useSyncExternalStore(subscribeRole, getRoleVersion, getRoleVersion);
  const role = getRole();
  const s = studentById(studentId);
  if (!canUsePacket(role))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">Sign in as the director or a case manager to build the IEP for SRS.</p>
      </>
    );
  if (!s)
    return (
      <p>
        Student not found. <a href="#/">Back to caseload</a>
      </p>
    );
  const who = roleById(role)?.person ?? "Staff";
  const rec = getPacket(studentId);
  const sections = buildPacket(studentId);
  const pasted = sections.filter((x) => sectionState(rec, x) === "pasted").length;
  return (
    <>
      <a className="btn back" href={`#/student/${studentId}`}>
        ← {displayName(s.student)}
      </a>
      <h2 style={{ textTransform: "none", color: "var(--text)", fontSize: "1.4rem" }}>
        IEP for SRS
      </h2>
      <p>
        Write the IEP here, then copy each section into SRS yourself. Nothing leaves this app, and
        the checklist only records that you marked a section pasted. The browser keeps copied text
        on the clipboard until you copy something else.
      </p>
      <p>
        <strong>
          {pasted} of {sections.length} sections marked pasted
        </strong>
      </p>
      {sections.map((sec) => {
        const state = sectionState(rec, sec);
        const mark = rec.marked[sec.id];
        return (
          <section className="goal" key={sec.id} aria-label={sec.title}>
            <h3>{sec.title}</h3>
            <p className="meta">
              {STATE_TEXT[state]}
              {mark && state === "pasted"
                ? ` · ${mark.who}, ${new Date(mark.at).toLocaleString()}`
                : ""}
            </p>
            {(() => {
              const Form = FORMS.get(sec.id);
              return Form ? <Form studentId={studentId} /> : null;
            })()}
            <ul className="pick">
              {sec.items.map((item) => (
                <CopyRow
                  key={item.id}
                  item={item}
                  copied={isCopied(rec, item)}
                  onCopied={() => markCopied(studentId, item)}
                />
              ))}
            </ul>
            {sec.built && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={state === "pasted"}
                  disabled={state !== "pasted" && !canMark(rec, sec)}
                  onChange={(e) => setMarked(studentId, sec, e.target.checked, who)}
                />
                Mark section pasted into SRS
              </label>
            )}
          </section>
        );
      })}
    </>
  );
}
