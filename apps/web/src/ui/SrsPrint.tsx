import { createPortal } from "react-dom";
import type { Student } from "@synthetic/src/types.ts";
import type { PacketSection } from "../data/srsPacket.ts";
import "./srsPrint.css";

export const WATERMARK = "DRAFT, official IEP is in SRS";
export const NOT_BUILT_LINE = "Not in GoalLine yet. Type this section in SRS.";

/** First name and last initial, so a printed page carries no full name. */
export function shortName(s: Pick<Student, "first_name" | "last_name" | "preferred_name">): string {
  const first = (s.preferred_name ?? s.first_name).trim();
  const initial = s.last_name.trim().charAt(0);
  return initial ? `${first} ${initial}.` : first;
}

/** What the printed page says for one packet item. A blocked item is listed, not printed. */
export function printLines(item: {
  label: string;
  text?: string;
  pick?: string;
  blocked?: string;
}): string[] {
  if (item.blocked !== undefined) return [`Not ready: ${item.blocked}`];
  const out: string[] = [];
  if (item.text !== undefined) out.push(item.text);
  if (item.pick !== undefined) out.push(`Pick in SRS: ${item.pick}`);
  return out;
}

/** The printable pages: every section in SRS order. Plain markup, so it can be tested on its own. */
export function PrintPages({
  student,
  sections,
  today,
}: {
  student: Pick<Student, "first_name" | "last_name" | "preferred_name">;
  sections: PacketSection[];
  today: string;
}) {
  return (
    <div className="srs-print-root" aria-hidden="true">
      <div className="srs-watermark">{WATERMARK}</div>
      <h1>IEP draft for {shortName(student)}</h1>
      <p>
        {WATERMARK}. Printed {today}. Practice data only.
      </p>
      {sections.map((sec) => (
        <section key={sec.id}>
          <h2>{sec.title}</h2>
          {!sec.built && <p>{NOT_BUILT_LINE}</p>}
          {sec.items.map((item) => (
            <div key={item.id} className="srs-print-item">
              <h3>{item.label}</h3>
              {printLines(item).map((line, i) => (
                <p key={i} className={item.blocked !== undefined ? "srs-print-note" : undefined}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * The Print draft button and a print-only copy of the packet. The copy is drawn outside the app so
 * the browser's print dialog (or Save as PDF) shows only it. Printing changes nothing: no copy
 * marks, no checklist, nothing is sent.
 */
export function PrintDraft({ student, sections }: { student: Student; sections: PacketSection[] }) {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <>
      <p>
        <button type="button" className="btn" onClick={() => window.print()}>
          Print draft
        </button>{" "}
        <span className="meta">
          For the meeting. Print or save as PDF; the official IEP is still in SRS.
        </span>
      </p>
      {typeof document !== "undefined" &&
        createPortal(
          <PrintPages student={student} sections={sections} today={today} />,
          document.body,
        )}
    </>
  );
}
