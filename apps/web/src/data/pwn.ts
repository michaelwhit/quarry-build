// Prior Written Notice draft (practice data only). The notice restates the plan in notice form, and
// it is built here by code from the teacher's own entries: no model writes any of it. Every date,
// number and instrument name is copied from the entries; a missing entry is reported, never guessed.
// The teacher reads each box and approves it before it can be copied. The app never sends anything
// to the state record system: the teacher pastes the text there.

export type RowKind = "special_education" | "related" | "school_personnel" | "accommodation";
export type RowChange = "added" | "changed" | "unchanged" | "removed";

export interface ServiceRowInput {
  kind: RowKind;
  title: string;
  change: RowChange;
  /** Text as typed, such as "22 days/semester". */
  frequency: string;
  /** Text as typed, such as "15 min/day". */
  duration: string;
  location: string;
  start?: string;
  end?: string;
}

export interface GoalInput {
  /** Short label of the goal area, such as "Reading fluency". */
  area: string;
  change: RowChange;
}

export type ConsiderationChoice = "considered_not_needed" | "needed";

export interface ConsiderationInput {
  /** The box name as the record system shows it, such as "Assistive technology". */
  label: string;
  choice: ConsiderationChoice;
  /** One line from the teacher; required when the choice is considered_not_needed. */
  reason?: string;
}

export interface AlternativeInput {
  /** The other option the team looked at. */
  option: string;
  /** Why the team did not choose it. */
  reason: string;
}

export interface PwnInput {
  /** YYYY-MM-DD */
  noteDate: string;
  deliveryDate?: string;
  /** The delivery method is picked in the record system; this is the exact label to pick. */
  deliveryMethod?: string;
  rows: ServiceRowInput[];
  goals: GoalInput[];
  considerations: ConsiderationInput[];
  /** Absent until the team answers the extended school year question; the notice is then blocked. */
  esy?: { choice: ConsiderationChoice; reason?: string };
  alternatives: AlternativeInput[];
  /** Instrument names from confirmed evidence rows (names only, never scores). */
  evaluations: string[];
  /** Other factors the teacher wants in the notice, one line each. */
  otherFactors: string[];
  /** The teacher's own one-line reasons for the proposed or stopped actions; nothing is invented. */
  reasons?: string[];
  contact: { name: string; role: string; phone?: string };
}

export type BoxId =
  "proposed" | "refused" | "why" | "other_options" | "evaluation" | "other_factors" | "contact";

export const BOX_LABEL: Record<BoxId, string> = {
  proposed: "Action proposed",
  refused: "Action refused",
  why: "Why this action",
  other_options: "Other options considered and why rejected",
  evaluation: "Evaluation procedures used",
  other_factors: "Other relevant factors",
  contact: "Contact for questions",
};

export interface Box {
  id: BoxId;
  label: string;
  text: string;
  /** Empty when the box can be approved. */
  blocked: string[];
}

export interface PwnDraft {
  noteDate: string;
  deliveryDate: string;
  /** Shown as "Pick in the record system: <label>"; never pasted as text. */
  deliveryMethod: string;
  boxes: Box[];
  /** Everything that stops the draft from being approved, in box order. */
  blocked: string[];
}

const KIND_LABEL: Record<RowKind, string> = {
  special_education: "special education",
  related: "related service",
  school_personnel: "support for school personnel",
  accommodation: "accommodation",
};

/** "Jan 5, 2027" from YYYY-MM-DD, or "" when the text is not a real calendar day. */
export function dateText(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso?.trim() ?? "");
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return "";
  }
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${names[mo - 1]} ${d}, ${y}`;
}

/** Counts or conditions only; empty and "as needed" style text cannot go into a notice. */
export function vagueAmount(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "" || /^(as needed|as appropriate|ongoing|varies|n\/a|tbd)\.?$/.test(t);
}

function rowLine(r: ServiceRowInput): string {
  const span = [
    dateText(r.start) && `from ${dateText(r.start)}`,
    dateText(r.end) && `to ${dateText(r.end)}`,
  ]
    .filter(Boolean)
    .join(" ");
  return [
    `${r.title} (${KIND_LABEL[r.kind]}): ${r.frequency.trim()}, ${r.duration.trim()}, in ${r.location.trim()}`,
    span,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

function checkRows(rows: ServiceRowInput[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.change === "unchanged" || r.change === "removed") continue;
    if (vagueAmount(r.frequency)) out.push(`${r.title}: frequency needs a count or a condition.`);
    if (vagueAmount(r.duration)) out.push(`${r.title}: duration needs an amount of time.`);
    if (r.location.trim() === "") out.push(`${r.title}: location is missing.`);
    if (r.title.trim() === "") out.push("A service row needs a title.");
    const [start, end] = [r.start?.trim() ?? "", r.end?.trim() ?? ""];
    if (start && !dateText(start)) out.push(`${r.title}: start date is not a real date.`);
    if (end && !dateText(end)) out.push(`${r.title}: end date is not a real date.`);
    if (dateText(start) && dateText(end) && end < start)
      out.push(`${r.title}: end date is before the start date.`);
  }
  return out;
}

function bullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

/** Builds the notice boxes from the entries. Pure: the same input always gives the same text. */
export function draftPwn(input: PwnInput): PwnDraft {
  const added = input.rows.filter((r) => r.change === "added");
  const changed = input.rows.filter((r) => r.change === "changed");
  const removed = input.rows.filter((r) => r.change === "removed");
  const goalsNew = input.goals.filter((g) => g.change === "added" || g.change === "changed");
  const goalsGone = input.goals.filter((g) => g.change === "removed");
  const notNeeded = input.considerations.filter((c) => c.choice === "considered_not_needed");

  const proposed: string[] = [
    ...added.map((r) => `Start ${rowLine(r)}`),
    ...changed.map((r) => `Change to ${rowLine(r)}`),
    ...goalsNew.map((g) => `${g.change === "added" ? "Add" : "Revise"} the annual goal: ${g.area}`),
  ];
  const refused: string[] = [
    ...removed.map((r) => `Stop ${r.title} (${KIND_LABEL[r.kind]})`),
    ...goalsGone.map((g) => `Stop the annual goal: ${g.area}`),
    ...notNeeded.map((c) => `No ${c.label.toLowerCase()} supports at this time`),
    ...(input.esy?.choice === "considered_not_needed"
      ? ["No extended school year services at this time"]
      : []),
  ];
  const teacherReasons = (input.reasons ?? []).map((r) => r.trim()).filter(Boolean);
  const why: string[] = [
    ...teacherReasons,
    ...notNeeded.map((c) => `${c.label}: ${(c.reason ?? "").trim()}`),
    ...(input.esy?.choice === "considered_not_needed"
      ? [`Extended school year: ${(input.esy?.reason ?? "").trim()}`]
      : []),
  ];

  const blockedWhy: string[] = [];
  if (
    why.length === 0 ||
    (teacherReasons.length === 0 && (proposed.length > 0 || refused.length > 0))
  ) {
    blockedWhy.push("Add the team's reason for the action in your own words.");
  }
  for (const c of notNeeded) {
    if (!(c.reason ?? "").trim())
      blockedWhy.push(`${c.label}: add the one-line reason it is not needed.`);
  }
  if (input.esy?.choice === "considered_not_needed" && !(input.esy?.reason ?? "").trim()) {
    blockedWhy.push("Extended school year: add the data-based reason it is not needed.");
  }

  const altBlocked = input.alternatives
    .filter((a) => !a.option.trim() || !a.reason.trim())
    .map(() => "Other options: each needs the option and the reason it was rejected.");
  const alts = input.alternatives.filter((a) => a.option.trim() && a.reason.trim());

  const contactName = input.contact.name.trim();
  const contact = contactName
    ? [contactName, input.contact.role.trim(), input.contact.phone?.trim() ?? ""]
        .filter(Boolean)
        .join(", ")
    : "";
  const factors = input.otherFactors.map((f) => f.trim()).filter(Boolean);
  const goalsBlocked = [...goalsNew, ...goalsGone].some((g) => !g.area.trim())
    ? ["A goal needs a short area label."]
    : [];
  const considerationBlocked = notNeeded.some((c) => !c.label.trim())
    ? ["A consideration box needs its name."]
    : [];

  const boxes: Box[] = [
    {
      id: "proposed",
      label: BOX_LABEL.proposed,
      text: proposed.length ? bullets(proposed) : "No new action is proposed.",
      blocked: [
        ...(proposed.length === 0 && removed.length === 0 && goalsGone.length === 0
          ? ["Nothing was added or changed, so there is no action to propose."]
          : []),
        ...checkRows([...added, ...changed]),
        ...goalsBlocked,
      ],
    },
    {
      id: "refused",
      label: BOX_LABEL.refused,
      text: refused.length ? bullets(refused) : "No action is refused.",
      blocked: input.esy ? [] : ["Extended school year: choose not needed or needed."],
    },
    {
      id: "why",
      label: BOX_LABEL.why,
      text: bullets(why),
      blocked: [...blockedWhy, ...considerationBlocked],
    },
    {
      id: "other_options",
      label: BOX_LABEL.other_options,
      text: alts.length
        ? bullets(alts.map((a) => `${a.option.trim()}: rejected because ${a.reason.trim()}`))
        : "The team did not record other options.",
      blocked: [...new Set(altBlocked)],
    },
    {
      id: "evaluation",
      label: BOX_LABEL.evaluation,
      text: input.evaluations.length
        ? `The team used: ${input.evaluations
            .map((e) => e.trim())
            .filter(Boolean)
            .join("; ")}.`
        : "",
      blocked: input.evaluations.some((e) => e.trim())
        ? []
        : ["Confirm at least one evaluation instrument."],
    },
    {
      id: "other_factors",
      label: BOX_LABEL.other_factors,
      text: factors.length ? bullets(factors) : "None.",
      blocked: [],
    },
    {
      id: "contact",
      label: BOX_LABEL.contact,
      text: contact,
      blocked:
        contact && input.contact.role.trim()
          ? []
          : ["Add the case manager's name and role as the contact."],
    },
  ];

  const noteDate = dateText(input.noteDate);
  const deliveryDate = dateText(input.deliveryDate);
  const blocked = [
    ...(noteDate ? [] : ["Date of note is not a real date."]),
    ...(input.deliveryDate && !deliveryDate ? ["Date of delivery is not a real date."] : []),
    ...(deliveryDate && noteDate && input.deliveryDate!.trim() < input.noteDate.trim()
      ? ["Date of delivery is before the date of note."]
      : []),
    ...boxes.flatMap((b) => b.blocked),
  ];

  return {
    noteDate,
    deliveryDate,
    deliveryMethod: input.deliveryMethod?.trim() ?? "",
    boxes,
    blocked,
  };
}

/** Fast stable fingerprint (FNV-1a) of what the teacher approved; the copied text is never stored. */
export function pwnFingerprint(d: PwnDraft): string {
  const s = JSON.stringify([d.noteDate, d.deliveryDate, d.boxes.map((b) => [b.id, b.text])]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The text for one Copy button; null when the box is blocked, so nothing half-built is copied. */
export function copyText(d: PwnDraft, id: BoxId): string | null {
  const box = d.boxes.find((b) => b.id === id);
  return box && box.blocked.length === 0 && box.text ? box.text : null;
}
