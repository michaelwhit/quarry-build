import { nameMatcher, redact } from "./evaluation.ts";

// Present levels (practice data only). The teacher confirms scores and stated needs, a drafter
// writes sentences with placeholders, and this code fills every number and printed descriptor from
// the confirmed rows. The drafter never sees or writes a number. A draft is a suggestion: the
// teacher edits it and approves each slot. The drafter here is an offline stand-in; the same
// interface is what the real drafting service will fill later.

export type Area = "reading" | "math" | "other";
export const AREAS: { id: Area; label: string }[] = [
  { id: "reading", label: "Reading or literacy" },
  { id: "math", label: "Math" },
  { id: "other", label: "Other areas (communication, behavior, motor, social skills)" },
];

export type Source = "evaluation" | "state_district" | "classroom";
export const SOURCES: { id: Source; label: string }[] = [
  { id: "evaluation", label: "Evaluation" },
  { id: "state_district", label: "State or district assessment" },
  { id: "classroom", label: "Classroom assessment" },
];

export type ScoreKind =
  | "standard"
  | "scaled"
  | "tScore"
  | "percentile"
  | "raw"
  | "cbm"
  | "ageEquivalent"
  | "gradeEquivalent";
export const SCORE_KINDS: { id: ScoreKind; label: string }[] = [
  { id: "standard", label: "Standard score" },
  { id: "scaled", label: "Scaled score" },
  { id: "tScore", label: "T-score" },
  { id: "percentile", label: "Percentile" },
  { id: "raw", label: "Raw score" },
  { id: "cbm", label: "Curriculum-based measure" },
  { id: "ageEquivalent", label: "Age equivalent" },
  { id: "gradeEquivalent", label: "Grade equivalent" },
];
/** Stored and shown, never written into a draft. */
export const isEquivalent = (k: ScoreKind) => k === "ageEquivalent" || k === "gradeEquivalent";
const kindLabel = (k: ScoreKind) => SCORE_KINDS.find((x) => x.id === k)?.label ?? k;

export interface EvScore {
  id: string;
  state: "draft" | "confirmed";
  area: Area;
  source: Source;
  instrument: string;
  measure: string;
  kind: ScoreKind;
  /** As typed. */
  value: string;
  percentile: string;
  /** The evaluator's label, exactly as printed. Never rewritten. */
  descriptor: string;
  /** YYYY-MM-DD */
  testedOn: string;
}

export type StatedBy = "evaluator" | "mdt" | "teacher";
export interface EvStatement {
  id: string;
  state: "draft" | "confirmed";
  kind: "strength" | "need";
  area: Area;
  statedBy: StatedBy;
  text: string;
  /** How the need affects access to instruction. Optional. */
  implication: string;
  scoreIds: string[];
}

export interface LogRow {
  at: string;
  who: string;
  text: string;
}

export interface SlotDraft {
  /** The text the teacher sees and edits. */
  text: string;
  sentences: Sentence[];
  edited: boolean;
  approved: boolean;
  /** Which evidence the draft was built from; a change makes the draft out of date. */
  basis: string;
  drafter: string;
}

export interface PlRecord {
  studentId: string;
  scores: EvScore[];
  statements: EvStatement[];
  slots: Record<string, SlotDraft>;
  log: LogRow[];
  nextId: number;
}

export interface Sentence {
  /** Final text with every placeholder filled. */
  text: string;
  /** Evidence ids behind the sentence. */
  cites: string[];
}

// ---- template ----

export interface SlotDef {
  key: string;
  label: string;
  /** The NDE model IEP section the slot pastes into. */
  nde: string;
  /** Writing guidance the drafter receives. */
  instructions: string;
  /** False: the teacher writes it. */
  ai: boolean;
}

/** The default template: the model IEP's summary of current performance and the PLAAFP tables. */
export const SLOTS: readonly SlotDef[] = [
  {
    key: "summary.strengths",
    label: "Student Strengths",
    nde: "007.07B1",
    ai: true,
    instructions: "Lead with what the student can do. One sentence per strength.",
  },
  {
    key: "summary.parent_input",
    label: "Parental Information, Concerns, and Vision for Life After High School",
    nde: "007.07B1",
    ai: false,
    instructions: "Written by the teacher from what the family and student shared.",
  },
  {
    key: "summary.eval_results",
    label:
      "Results of Initial or Most Recent Evaluation and the Academic, Developmental, and Functional Needs of the Child",
    nde: "007.07B2",
    ai: true,
    instructions: "Summarize; do not copy the report. One sentence per need.",
  },
  {
    key: "summary.state_district_results",
    label:
      "Results of Child's Performance on General State and District-Wide Assessments Within the Past Year",
    nde: "007.07B",
    ai: true,
    instructions: "Report each result and its printed label.",
  },
  {
    key: "plaafp.reading_literacy",
    label: "PLAAFP: Reading or Literacy",
    nde: "007.07A1",
    ai: true,
    instructions:
      "Data, then what the student can and cannot yet do, then the impact on instruction.",
  },
  {
    key: "plaafp.math",
    label: "PLAAFP: Math",
    nde: "007.07A1",
    ai: true,
    instructions:
      "Data, then what the student can and cannot yet do, then the impact on instruction.",
  },
  {
    key: "plaafp.other_areas",
    label: "PLAAFP: Other Areas Impacted",
    nde: "007.07A1",
    ai: true,
    instructions:
      "Data, then what the student can and cannot yet do, then the impact on instruction.",
  },
];
export const slotDef = (key: string) => SLOTS.find((s) => s.key === key);

const AREA_OF_SLOT: Record<string, Area> = {
  "plaafp.reading_literacy": "reading",
  "plaafp.math": "math",
  "plaafp.other_areas": "other",
};

export interface SlotEvidence {
  scores: EvScore[];
  statements: EvStatement[];
}

/** The confirmed evidence a slot may use. Draft rows are never used. */
export function slotEvidence(
  rec: Pick<PlRecord, "scores" | "statements">,
  key: string,
): SlotEvidence {
  const sc = rec.scores.filter((s) => s.state === "confirmed");
  const st = rec.statements.filter((s) => s.state === "confirmed");
  const area = AREA_OF_SLOT[key];
  if (key === "summary.strengths")
    return { scores: [], statements: st.filter((s) => s.kind === "strength") };
  if (key === "summary.eval_results")
    return {
      scores: sc.filter((s) => s.source === "evaluation"),
      statements: st.filter((s) => s.kind === "need" && s.statedBy !== "teacher"),
    };
  if (key === "summary.state_district_results")
    return { scores: sc.filter((s) => s.source === "state_district"), statements: [] };
  if (area)
    return {
      scores: sc.filter((s) => s.source === "classroom" && s.area === area),
      statements: st.filter(
        (s) => s.kind === "need" && s.statedBy === "teacher" && s.area === area,
      ),
    };
  return { scores: [], statements: [] };
}

const usable = (s: EvScore) => !isEquivalent(s.kind);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by the checks and storage in the next patch
const hasEvidence = (e: SlotEvidence) => e.scores.some(usable) || e.statements.length > 0;

/** Changes whenever anything the slot would use changes. */
export const basisOf = (e: SlotEvidence): string =>
  JSON.stringify([
    e.scores
      .filter(usable)
      .map((s) => [
        s.id,
        s.measure,
        s.instrument,
        s.kind,
        s.value,
        s.percentile,
        s.descriptor,
        s.testedOn,
      ]),
    e.statements.map((s) => [s.id, s.kind, s.statedBy, s.text, s.implication, s.scoreIds]),
  ]);

// ---- validating typed rows ----

const DECIMAL = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)$/;
const RANGE: Partial<Record<ScoreKind, [number, number]>> = {
  standard: [40, 160],
  scaled: [1, 19],
  tScore: [10, 90],
  percentile: [1, 99],
};
const isDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  // A date that rolls over (2026-02-31 becomes March 3) is not a real day.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** What is wrong with a score row, in plain words. Empty means it can be confirmed. */
export function scoreProblems(s: EvScore, today: string): string[] {
  const found: string[] = [];
  if (s.measure.trim() === "") found.push("Name the measure.");
  const v = s.value.trim();
  if (v === "") found.push("Enter the score.");
  else if (!DECIMAL.test(v)) found.push("The score must be a number.");
  else {
    const r = RANGE[s.kind];
    const n = Number(v);
    if (r && (n < r[0] || n > r[1]))
      found.push(
        `A ${kindLabel(s.kind).toLowerCase()} is from ${r[0]} to ${r[1]}. Check the type and the score.`,
      );
  }
  const p = s.percentile.trim();
  if (p !== "" && !(/^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 99))
    found.push("Percentile is a whole number from 1 to 99.");
  if (!isDay(s.testedOn)) found.push("Enter the date it was given (year-month-day).");
  else if (s.testedOn > today) found.push("The test date is in the future.");
  if (s.descriptor.length > 60) found.push("The printed label is too long.");
  return found;
}

export function statementProblems(s: EvStatement): string[] {
  const found: string[] = [];
  if (s.text.trim() === "")
    found.push(s.kind === "need" ? "Describe the need." : "Describe the strength.");
  return found;
}

// ---- what the drafter is given, and what it returns ----

export interface RedactedScore {
  id: string;
  measure: string;
  instrument: string;
  kind: string;
  /** The printed label exists. Its text is filled in by code. */
  hasDescriptor: boolean;
  hasPercentile: boolean;
}
export interface RedactedStatement {
  id: string;
  kind: "strength" | "need";
  statedBy: StatedBy;
  text: string;
  implication: string;
  scoreIds: string[];
}
/** Everything a drafter may see. No scores, no percentiles, no dates, no names. */
export interface SlotRequest {
  slotKey: string;
  label: string;
  instructions: string;
  scores: RedactedScore[];
  statements: RedactedStatement[];
}
export interface RawSentence {
  /** Words with placeholders: {{student}}, {{measure:ID}}, {{value:ID}}, {{percentile:ID}}, {{descriptor:ID}}, {{date:ID}}. */
  template: string;
  cites: string[];
}
export interface Drafter {
  id: string;
  draft(req: SlotRequest): Promise<RawSentence[]>;
}

/** Held-back lines are listed so the screen can say why. */
export interface BuiltRequest {
  request: SlotRequest;
  withheld: string[];
}

export function buildRequest(def: SlotDef, ev: SlotEvidence, names: string[]): BuiltRequest {
  const matcher = nameMatcher(names);
  const withheld: string[] = [];
  const clean = (text: string, what: string) => {
    const r = redact(text, matcher);
    if (r.withheldReasons.length > 0)
      withheld.push(`${what}: looks like ${r.withheldReasons.join(", ")}`);
    return r.withheldReasons.length > 0 ? "" : r.text;
  };
  return {
    withheld,
    request: {
      slotKey: def.key,
      label: def.label,
      instructions: def.instructions,
      scores: ev.scores.filter(usable).map((s) => ({
        id: s.id,
        measure: clean(s.measure, "A measure name"),
        instrument: clean(s.instrument, "An instrument name"),
        kind: kindLabel(s.kind),
        hasDescriptor: s.descriptor.trim() !== "",
        hasPercentile: s.percentile.trim() !== "",
      })),
      statements: ev.statements.map((s) => ({
        id: s.id,
        kind: s.kind,
        statedBy: s.statedBy,
        text: clean(s.text, "A statement"),
        implication: clean(s.implication, "An implication"),
        scoreIds: s.scoreIds,
      })),
    },
  };
}

const end = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
/** Lowercases the first letter to join a clause, but keeps acronyms ("ELL"), "I" and the student's name. */
const lower1 = (t: string, keep: string[] = []) => {
  const word = /^[^\s,.;:]+/u.exec(t)?.[0] ?? "";
  if (/^\p{Lu}{2,}/u.test(word) || /^I(?:'|$)/.test(word) || keep.includes(word)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
};

/** The offline stand-in. Deterministic, no network, writes only placeholders and the teacher's own words. */
export const mockDrafter: Drafter = {
  id: "offline-sample",
  async draft(req) {
    const out: RawSentence[] = [];
    for (const s of req.scores) {
      const inst = s.instrument.trim() !== "" ? ` ({{instrument:${s.id}}})` : "";
      const pct = s.hasPercentile ? ", percentile {{percentile:" + s.id + "}}" : "";
      const label = s.hasDescriptor
        ? ", described in the report as {{descriptor:" + s.id + "}}"
        : "";
      out.push({
        template:
          `On {{measure:${s.id}}}${inst}, {{student}} had a ${s.kind.toLowerCase()} of {{value:${s.id}}}` +
          `${pct}${label}, given {{date:${s.id}}}.`,
        cites: [s.id],
      });
    }
    for (const st of req.statements) {
      if (st.kind === "strength") {
        out.push({
          template: `{{student}} shows a strength: {{text:${st.id}}}`,
          cites: [st.id],
        });
        continue;
      }
      const who =
        st.statedBy === "evaluator"
          ? "The evaluator"
          : st.statedBy === "mdt"
            ? "The team"
            : "The teacher";
      out.push({
        template: `${who} identified a need: {{text:${st.id}}}`,
        cites: [st.id, ...st.scoreIds],
      });
      if (st.implication.trim() !== "")
        out.push({
          template: `Impact on instruction: {{implication:${st.id}}}`,
          cites: [st.id],
        });
    }
    return out;
  },
};

// ---- filling placeholders ----

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by the checks and storage in the next patch
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PLACEHOLDER =
  /\{\{(student|measure|instrument|value|percentile|descriptor|date|text|implication)(?::([A-Za-z0-9_-]+))?\}\}/g;

export interface FillResult {
  sentences: Sentence[];
  /** Why a sentence was dropped. */
  dropped: string[];
}

const dateText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** Fills placeholders from confirmed rows. A sentence the drafter wrote with its own digits is dropped. */
export function fill(raw: RawSentence[], ev: SlotEvidence, firstName: string): FillResult {
  const byId = new Map(ev.scores.map((s) => [s.id, s]));
  const stById = new Map(ev.statements.map((s) => [s.id, s]));
  const known = new Set([...ev.scores.map((s) => s.id), ...ev.statements.map((s) => s.id)]);
  const sentences: Sentence[] = [];
  const dropped: string[] = [];
  for (const r of raw) {
    // Digits are only allowed through placeholders, so a number can only come from a row.
    if (/\d/.test(r.template.replace(PLACEHOLDER, ""))) {
      dropped.push("A sentence with a number the drafter wrote was removed.");
      continue;
    }
    let bad = false;
    const cites = new Set(r.cites.filter((c) => known.has(c)));
    const text = r.template
      .replace(PLACEHOLDER, (_m, kind: string, id?: string) => {
        if (kind === "student") return firstName;
        // The teacher's own words: they may hold digits, and are not a number the drafter wrote.
        if (kind === "text" || kind === "implication") {
          const st = id ? stById.get(id) : undefined;
          const own = kind === "text" ? st?.text : st?.implication;
          if (!st || !own || own.trim() === "") return ((bad = true), "");
          cites.add(st.id);
          return lower1(end(own), [firstName]);
        }
        const s = id ? byId.get(id) : undefined;
        if (!s) return ((bad = true), "");
        cites.add(s.id);
        if (kind === "measure") return s.measure.trim();
        if (kind === "instrument") return s.instrument.trim() || ((bad = true), "");
        if (kind === "value") return s.value.trim();
        if (kind === "percentile") return s.percentile.trim() || ((bad = true), "");
        if (kind === "descriptor") return s.descriptor.trim() || ((bad = true), "");
        return dateText(s.testedOn);
      })
      .replace(/\[name\]/g, firstName);
    if (bad) dropped.push("A sentence that used a missing value was removed.");
    else sentences.push({ text, cites: [...cites] });
  }
  return { sentences, dropped };
}
