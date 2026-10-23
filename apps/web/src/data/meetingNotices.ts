import { dateText } from "./pwn.ts";

// Drafts for the notices around an IEP meeting (practice data only): the meeting invitation, the
// consent request and the evaluation timeline. Code builds every sentence from the teacher's own
// entries; no model writes any of it, and a missing entry is reported rather than guessed. The
// teacher reads and approves each box before copying it. Nothing is sent anywhere.

export interface NoticeBox {
  id: string;
  label: string;
  text: string;
  /** Empty when the box can be approved. */
  blocked: string[];
}
export interface NoticeDraft {
  boxes: NoticeBox[];
  /** Every reason the draft cannot be approved yet, in box order. */
  blocked: string[];
}

/**
 * Standard lines. The district's own wording is to be confirmed inside the record system; these are
 * placeholders the teacher can read, not legal text.
 */
export const STANDARD = {
  voluntary: "Giving consent is voluntary, and you may take it back at any time.",
  reschedule: "If this time does not work for you, please contact us to choose another.",
} as const;

const bullets = (lines: string[]) => lines.map((l) => `- ${l}`).join("\n");
const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
const box = (id: string, label: string, text: string, blocked: string[]): NoticeBox => ({
  id,
  label,
  text,
  blocked,
});
const finish = (boxes: NoticeBox[]): NoticeDraft => ({
  boxes,
  blocked: boxes.flatMap((b) => b.blocked),
});

export interface Contact {
  name: string;
  role: string;
  phone?: string;
}
function contactBox(c: Contact): NoticeBox {
  const name = c.name.trim();
  const text = name ? [name, c.role.trim(), c.phone?.trim() ?? ""].filter(Boolean).join(", ") : "";
  return box(
    "contact",
    "Contact for questions",
    text,
    name && c.role.trim() ? [] : ["Add the contact's name and role."],
  );
}

// ---- meeting invitation ----

export type MeetingPurpose = "initial_iep" | "annual_review" | "reevaluation" | "amendment";
export const PURPOSE_TEXT: Record<MeetingPurpose, string> = {
  initial_iep: "to develop the first individualized education program",
  annual_review: "to review the individualized education program and plan for the coming year",
  reevaluation: "to review evaluation results and decide what the student needs",
  amendment: "to talk about a change to the individualized education program",
};

export interface InviteInput {
  purpose: MeetingPurpose;
  /** YYYY-MM-DD */
  meetingDate: string;
  /** As typed, such as "9:30 AM". */
  meetingTime: string;
  location: string;
  invitees: { name: string; position: string }[];
  contact: Contact;
}

export function draftInvite(input: InviteInput): NoticeDraft {
  const when = dateText(input.meetingDate);
  const time = input.meetingTime.trim();
  const place = input.location.trim();
  const people = input.invitees.filter((p) => p.name.trim() && p.position.trim());
  const halfFilled = input.invitees.length - people.length;
  return finish([
    box(
      "purpose",
      "Purpose of the meeting",
      `We are inviting you to a meeting ${PURPOSE_TEXT[input.purpose]}.`,
      [],
    ),
    box(
      "when_where",
      "Date, time and place",
      when && time && place ? `${when}, ${time}, ${place}` : "",
      [
        ...(when ? [] : ["Date of the meeting is not a real date."]),
        ...(time ? [] : ["Add the meeting time."]),
        ...(place ? [] : ["Add the meeting place."]),
      ],
    ),
    box(
      "invitees",
      "People invited",
      people.length ? bullets(people.map((p) => `${p.name.trim()}, ${p.position.trim()}`)) : "",
      [
        ...(people.length ? [] : ["Add at least one person invited."]),
        ...(halfFilled > 0 ? ["Each person invited needs a name and a position."] : []),
      ],
    ),
    box("reschedule", "Changing the time", STANDARD.reschedule, []),
    contactBox(input.contact),
  ]);
}

// ---- consent request ----

export type ConsentActivity = "initial_evaluation" | "reevaluation" | "initial_services";
export const ACTIVITY_TEXT: Record<ConsentActivity, string> = {
  initial_evaluation: "an evaluation to learn whether the student needs special education",
  reevaluation: "a reevaluation of the student's needs",
  initial_services: "special education services for the first time",
};

export interface ConsentInput {
  activity: ConsentActivity;
  /** Areas to be looked at, such as "Reading". The teacher's words. */
  areas: string[];
  /** Instrument names, if any are planned. */
  instruments: string[];
  /** The teacher's own one or two sentences on why. */
  reason: string;
  contact: Contact;
}

export function draftConsent(input: ConsentInput): NoticeDraft {
  const areas = clean(input.areas);
  const instruments = clean(input.instruments);
  const evaluating = input.activity !== "initial_services";
  const reason = input.reason.trim();
  return finish([
    box(
      "request",
      "What we are asking consent for",
      `We are asking for your consent for ${ACTIVITY_TEXT[input.activity]}.`,
      [],
    ),
    box("why", "Why", reason, reason ? [] : ["Add the reason in your own words."]),
    box(
      "areas",
      "Areas and procedures",
      [
        areas.length ? `Areas: ${areas.join("; ")}.` : "",
        instruments.length ? `Procedures and instruments: ${instruments.join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      evaluating && areas.length === 0 ? ["Name at least one area to be evaluated."] : [],
    ),
    box("voluntary", "Your choice", STANDARD.voluntary, []),
    contactBox(input.contact),
  ]);
}

// ---- evaluation timeline ----

export interface TimelineInput {
  /** YYYY-MM-DD: the day written consent was received. */
  consentDate: string;
  /** School days allowed from consent to the evaluation report. The district sets this number. */
  schoolDaysAllowed: number;
  /** YYYY-MM-DD days with no school (breaks, holidays). Weekends are skipped automatically. */
  noSchoolDays: string[];
  /** Optional school days between the report and the IEP meeting; the district sets this too. */
  meetingWithinDays?: number;
}

export interface TimelineRow {
  label: string;
  /** Printed date, or "" when it cannot be worked out. */
  date: string;
}
export interface TimelineDraft {
  rows: TimelineRow[];
  blocked: string[];
}

const DAY = 86_400_000;
const utc = (iso: string): number | null => {
  if (!dateText(iso)) return null;
  const [y, m, d] = iso.trim().split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The school day that is `n` school days after `from` (weekends and listed days skipped). */
export function addSchoolDays(from: string, n: number, noSchool: string[]): string {
  const start = utc(from);
  if (start === null) return "";
  const off = new Set(noSchool.map((d) => d.trim()));
  let t = start;
  let left = n;
  while (left > 0) {
    t += DAY;
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6 && !off.has(isoOf(t))) left--;
  }
  return isoOf(t);
}

export function draftTimeline(input: TimelineInput): TimelineDraft {
  const blocked: string[] = [];
  const consent = dateText(input.consentDate);
  if (!consent) blocked.push("Date consent was received is not a real date.");
  const goodDays = (n: number) => Number.isInteger(n) && n >= 1 && n <= 200;
  if (!goodDays(input.schoolDaysAllowed))
    blocked.push("School days allowed must be a whole number from 1 to 200.");
  const bad = input.noSchoolDays.filter((d) => d.trim() !== "" && !dateText(d));
  if (bad.length) blocked.push("A no-school day is not a real date.");
  if (input.meetingWithinDays !== undefined && !goodDays(input.meetingWithinDays))
    blocked.push("Days from report to meeting must be a whole number from 1 to 200.");
  if (blocked.length) return { rows: [], blocked };

  const off = input.noSchoolDays;
  const due = addSchoolDays(input.consentDate, input.schoolDaysAllowed, off);
  const rows: TimelineRow[] = [
    { label: "Consent received", date: consent },
    { label: `Evaluation due (${input.schoolDaysAllowed} school days)`, date: dateText(due) },
  ];
  if (input.meetingWithinDays !== undefined)
    rows.push({
      label: `Meeting by (${input.meetingWithinDays} school days after the due date)`,
      date: dateText(addSchoolDays(due, input.meetingWithinDays, off)),
    });
  return { rows, blocked };
}

export const timelineText = (d: TimelineDraft): string | null =>
  d.blocked.length ? null : d.rows.map((r) => `${r.label}: ${r.date}`).join("\n");

/** The text for one Copy button; null when the box is blocked or empty. */
export function noticeCopy(d: NoticeDraft, id: string): string | null {
  const b = d.boxes.find((x) => x.id === id);
  return b && b.blocked.length === 0 && b.text ? b.text : null;
}
