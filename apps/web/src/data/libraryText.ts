// Goal wording from a library template, and the checks that decide whether a filled-in goal is
// measurable. Pure functions so they can be tested on their own. The rules match the Mac and iPhone
// library screens.

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "slot"; name: string }
  | { kind: "number"; text: string };

/** `{name}` is a blank to fill in, `{student}` is the student, `{95}` is a number shown as is. */
export function segments(template: string): Segment[] {
  const out: Segment[] = [];
  let buffer = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i] as string;
    if (ch === "{") {
      const close = template.indexOf("}", i);
      const name = close < 0 ? "" : template.slice(i + 1, close);
      if (name !== "" && !name.includes("{")) {
        if (buffer) out.push({ kind: "text", text: buffer });
        buffer = "";
        out.push(
          Number.isFinite(Number(name)) ? { kind: "number", text: name } : { kind: "slot", name },
        );
        i = close + 1;
        continue;
      }
    }
    buffer += ch;
    i++;
  }
  if (buffer) out.push({ kind: "text", text: buffer });
  return out;
}

/** "word_type" reads as "word type". */
export const label = (slot: string) => slot.replaceAll("_", " ");

/** The wording as one line for browsing: each blank shows as "[word type]". */
export function preview(template: string, student = "the student"): string {
  return segments(template)
    .map((s) =>
      s.kind === "text"
        ? s.text
        : s.kind === "number"
          ? s.text
          : s.name === "student"
            ? student
            : `[${label(s.name)}]`,
    )
    .join("");
}

/** Names of the blanks in order, without repeats and without the student. */
export function slotNames(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of segments(template))
    if (s.kind === "slot" && s.name !== "student" && !seen.has(s.name)) {
      seen.add(s.name);
      out.push(s.name);
    }
  return out;
}

export interface Slot {
  name: string;
  kind: "text" | "number" | "choice" | "date";
  default?: string;
  choices?: string[];
  help?: string;
}

export interface Mastery {
  threshold?: number | null;
  threshold_from_slot?: string;
  unit?: string;
  comparator: ">=" | "<=";
  window_kind: "consecutive" | "best_of";
  window_count: number;
  window_of: number;
  maintenance_check: boolean;
}

export function masteryLine(m: Mastery): string {
  let target: string;
  if (m.threshold != null) {
    const unit = m.unit === "percent" ? "%" : m.unit ? ` ${m.unit}` : "";
    target = `${m.threshold}${unit}`;
  } else if (m.threshold_from_slot) target = `the [${label(m.threshold_from_slot)}] you choose`;
  else target = "the target";
  const words =
    m.window_kind === "consecutive"
      ? `${m.window_count} times in a row`
      : `${m.window_count} of the last ${m.window_of} checks`;
  const comparator = m.comparator === ">=" ? "At or above" : "At or below";
  return `${comparator} ${target}, ${words}${m.maintenance_check ? ", then a later check that it lasts" : ""}`;
}

export interface DraftTemplate {
  template_text: string;
  condition_text: string;
  behavior_text: string;
  slots: Slot[];
  mastery: Mastery;
  method: string;
}

export interface DraftValues {
  /** Text, number and choice blanks by name. Dates are kept as yyyy-mm-dd text. */
  values: Record<string, string>;
}

/** The blanks the form shows: every one in the wording, in order, then any declared but unused. */
export function formSlots(t: DraftTemplate): Slot[] {
  const declared = new Map(t.slots.map((s) => [s.name, s]));
  return slotNames(t.template_text).map(
    (name) => declared.get(name) ?? { name, kind: name === "date" ? "date" : "text" },
  );
}

export function initialValues(t: DraftTemplate): Record<string, string> {
  const v: Record<string, string> = {};
  for (const s of t.slots) {
    if (s.default !== undefined) v[s.name] = s.default;
    else if (s.kind === "choice" && s.choices?.length === 1) v[s.name] = s.choices[0] as string;
  }
  return v;
}

const val = (values: Record<string, string>, name: string) => (values[name] ?? "").trim();

const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

/** One piece of the finished wording. */
export type Piece =
  | { kind: "text"; text: string }
  | { kind: "filled"; slot: string; text: string }
  | { kind: "empty"; slot: string };

export function pieces(
  t: DraftTemplate,
  values: Record<string, string>,
  student: string | null,
): Piece[] {
  const slots = new Map(formSlots(t).map((s) => [s.name, s]));
  return segments(t.template_text).map((seg): Piece => {
    if (seg.kind === "text" || seg.kind === "number") return { kind: "text", text: seg.text };
    if (seg.name === "student")
      return { kind: "filled", slot: "student", text: student ?? "the student" };
    const typed = val(values, seg.name);
    if (!slots.has(seg.name) || typed === "") return { kind: "empty", slot: seg.name };
    return {
      kind: "filled",
      slot: seg.name,
      text: slots.get(seg.name)?.kind === "date" ? longDate(typed) : typed,
    };
  });
}

export const renderedText = (
  t: DraftTemplate,
  values: Record<string, string>,
  student: string | null,
) =>
  pieces(t, values, student)
    .map((p) => (p.kind === "empty" ? `[${label(p.slot)}]` : p.kind === "text" ? p.text : p.text))
    .join("");

export interface Check {
  id: string;
  label: string;
  pass: boolean;
  fix?: string | undefined;
}

const VAGUE_VERBS = [
  "understand",
  "improve",
  "be aware of",
  "appreciate",
  "know",
  "learn about",
  "enjoy",
];
const VAGUE_FREQUENCIES = [
  "as needed",
  "as appropriate",
  "when needed",
  "if needed",
  "as necessary",
  "when appropriate",
];
const normalized = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" ");

/** True when the wording says "as needed" or a relative, which the rules do not allow. */
export const vagueFrequency = (text: string) =>
  VAGUE_FREQUENCIES.some((v) => normalized(text).includes(v));

/** `today` is yyyy-mm-dd, passed in so tests do not depend on the clock. */
export function checks(t: DraftTemplate, values: Record<string, string>, today: string): Check[] {
  const slots = formSlots(t);
  const out: Check[] = [];
  const missing = slots.filter((s) => val(values, s.name) === "");
  out.push({
    id: "slots",
    label: "Every blank is filled in",
    pass: missing.length === 0,
    fix: missing.length ? `Fill in: ${missing.map((s) => label(s.name)).join(", ")}` : undefined,
  });
  out.push({
    id: "condition",
    label: "Says when or with what help the student does it",
    pass: t.condition_text.trim() !== "",
    fix: 'Add a condition such as "Given a list of words".',
  });
  const behavior = normalized(t.behavior_text);
  const vague = VAGUE_VERBS.find((v) => behavior === v || behavior.startsWith(`${v} `));
  out.push({
    id: "observable",
    label: "Describes something you can see or hear",
    pass: behavior !== "" && !vague,
    fix: vague
      ? `"${vague}" cannot be observed. Use a verb like read, write, say or point to.`
      : "Say what the student will do.",
  });

  const m = t.mastery;
  let problem: string | undefined;
  if (m.threshold_from_slot) {
    const typed = val(values, m.threshold_from_slot);
    const n = Number(typed);
    if (typed === "") problem = `Fill in the ${label(m.threshold_from_slot)} target.`;
    else if (!/^\d+(\.\d+)?$/.test(typed) || !(n > 0))
      problem = `The ${label(m.threshold_from_slot)} target must be a plain number above zero, without % or units.`;
  } else if (m.threshold == null) problem = "Add how well the student must do it.";
  if (m.window_count < 1 || m.window_of < m.window_count)
    problem ??= "Say how many times, for example 3 of 4 checks.";
  out.push({
    id: "criterion",
    label: "Says how well and how often",
    pass: problem === undefined,
    fix: problem,
  });
  out.push({
    id: "method",
    label: "Has a way to measure it",
    pass: t.method !== "",
    fix: "Choose how data will be taken.",
  });

  const dateSlots = slots.filter((s) => s.kind === "date");
  const dates = dateSlots.map((s) => val(values, s.name)).filter(Boolean);
  const past = dates.some((d) => d < today);
  out.push({
    id: "date",
    label: "Has a date to be met by",
    pass: dates.length > 0 && !past,
    fix: past ? "That date has already passed." : "Pick the date the goal should be met by.",
  });

  const freeText = slots
    .filter((s) => s.kind === "text")
    .map((s) => normalized(val(values, s.name)));
  if (freeText.some((x) => VAGUE_FREQUENCIES.some((v) => x.includes(v))))
    out.push({
      id: "frequency",
      label: "Says how often, with a number",
      pass: false,
      fix: '"As needed" is not allowed. Say how many times and how often.',
    });
  return out;
}

export const isReady = (t: DraftTemplate, values: Record<string, string>, today: string) =>
  checks(t, values, today).every((c) => c.pass);
