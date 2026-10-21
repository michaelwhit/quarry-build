// Evaluation entry: type or paste an evaluation's scores and summary, see exactly what would be
// used after identifying details are removed, and confirm it. Mirrors the native app's
// EvidenceRedactor and EvidenceIntake. Nothing here is saved or sent anywhere.

export type EvaluationKind =
  | "psychological"
  | "speechLanguage"
  | "occupationalTherapy"
  | "physicalTherapy"
  | "teamReport"
  | "screener"
  | "other";

export const EVALUATION_KINDS: { id: EvaluationKind; label: string }[] = [
  { id: "psychological", label: "Psychological" },
  { id: "speechLanguage", label: "Speech-language" },
  { id: "occupationalTherapy", label: "Occupational therapy" },
  { id: "physicalTherapy", label: "Physical therapy" },
  { id: "teamReport", label: "Team report" },
  { id: "screener", label: "Screener or progress data" },
  { id: "other", label: "Other" },
];

export type ScoreType =
  | "standard"
  | "scaled"
  | "tScore"
  | "percentile"
  | "zScore"
  | "raw"
  | "cbm"
  | "ageEquivalent"
  | "gradeEquivalent";

export const SCORE_TYPES: { id: ScoreType; label: string }[] = [
  { id: "standard", label: "Standard score" },
  { id: "scaled", label: "Scaled score" },
  { id: "tScore", label: "T-score" },
  { id: "percentile", label: "Percentile" },
  { id: "zScore", label: "z-score" },
  { id: "raw", label: "Raw score" },
  { id: "cbm", label: "Curriculum-based measure" },
  { id: "ageEquivalent", label: "Age equivalent" },
  { id: "gradeEquivalent", label: "Grade equivalent" },
];

export interface ScoreRow {
  id: number;
  measure: string;
  scoreType: ScoreType;
  /** As typed, so a half-typed number is not lost. */
  value: string;
  percentile: string;
}

let nextRowId = 1;
export const newRow = (): ScoreRow => ({
  id: nextRowId++,
  measure: "",
  scoreType: "standard",
  value: "",
  percentile: "",
});

/** A plain decimal such as 85, -1.5 or .5; no hex, binary or exponent forms. */
const DECIMAL = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)$/;

const blank = (s: string) => s.trim() === "";
const isBlankRow = (r: ScoreRow) => blank(r.measure) && blank(r.value) && blank(r.percentile);

/** What is wrong with a score row, in plain words. */
export function rowProblems(r: ScoreRow): string[] {
  if (isBlankRow(r)) return [];
  const found: string[] = [];
  if (blank(r.measure)) found.push("Name the measure.");
  const v = r.value.trim();
  if (v === "") found.push("Enter the score.");
  else if (!DECIMAL.test(v)) found.push("The score must be a number.");
  const p = r.percentile.trim();
  if (p !== "") {
    const n = /^[+-]?\d+$/.test(p) ? Number.parseInt(p, 10) : Number.NaN;
    if (!(n >= 1 && n <= 99)) found.push("Percentile is a whole number from 1 to 99.");
  }
  return found;
}

export interface Redacted {
  text: string;
  /** How many details were replaced, by kind, for the preview ("2 names, 1 date"). */
  replaced: Record<string, number>;
  /** Why the line is held back. Empty means it can be used. */
  withheldReasons: string[];
}

const WITHHELD: [string, string][] = [
  ["date of birth", "birth date"],
  ["dob", "birth date"],
  ["home address", "home address"],
  ["street address", "home address"],
  ["mailing address", "home address"],
  ["social security", "identification number"],
  ["medicaid", "insurance details"],
  ["disability category", "disability category"],
  ["primary disability", "disability category"],
  ["eligible", "eligibility conclusion"],
  ["eligibility", "eligibility conclusion"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word boundaries that know every language's letters and digits, as the native app's do. The
// built-in \b only knows ASCII, so a name such as "José" would slip through.
const START = "(?<![\\p{L}\\p{N}_])";
const END = "(?![\\p{L}\\p{N}_])";
const D = "\\p{Nd}";
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const MONTH_NO_MAY = MONTH.replace("|may|", "|");

const PATTERNS: { label: string; token: string; re: RegExp }[] = [
  { label: "emails", token: "[email]", re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu },
  { label: "ids", token: "[id]", re: new RegExp(`${START}${D}{3}-${D}{2}-${D}{4}${END}`, "gu") },
  {
    label: "phones",
    token: "[phone]",
    re: new RegExp(`\\(?${START}${D}{3}\\)?[-. ]${D}{3}[-. ]${D}{4}${END}`, "gu"),
  },
  {
    label: "dates",
    token: "[date]",
    re: new RegExp(
      `${START}${D}{1,2}/${D}{1,2}/${D}{2,4}${END}|${START}${D}{4}-${D}{2}-${D}{2}${END}`,
      "gu",
    ),
  },
  {
    label: "dates",
    token: "[date]",
    // With a year: "March 4, 2015", "march 4,2015", "Mar.  2015" (month first) and "4 March 2015",
    // "4th of March, 2015" (day first). Any amount of space, comma optional.
    re: new RegExp(
      `${START}${MONTH}\\.?(?:\\s{1,4}${D}{1,2}(?:st|nd|rd|th)?)?\\s{0,4},?\\s{0,4}${D}{4}${END}|${START}${D}{1,2}(?:st|nd|rd|th)?(?:\\s{1,4}of)?\\s{1,4}${MONTH}\\.?\\s{0,4},?\\s{0,4}${D}{4}${END}`,
      "giu",
    ),
  },
  {
    // Month and day with no year. The bare word "may" is only taken when capitalised.
    label: "dates",
    token: "[date]",
    re: new RegExp(
      `${START}${MONTH_NO_MAY}\\.?\\s{1,4}${D}{1,2}(?:st|nd|rd|th)?${END}|${START}${D}{1,2}(?:st|nd|rd|th)?(?:\\s{1,4}of)?\\s{1,4}${MONTH_NO_MAY}${END}`,
      "giu",
    ),
  },
  {
    label: "dates",
    token: "[date]",
    re: new RegExp(
      `${START}May\\s{1,4}${D}{1,2}(?:st|nd|rd|th)?${END}|${START}${D}{1,2}(?:st|nd|rd|th)?(?:\\s{1,4}of)?\\s{1,4}May${END}`,
      "gu",
    ),
  },
  { label: "numbers", token: "[number]", re: new RegExp(`${START}${D}{7,}${END}`, "gu") },
];

const PHRASES = WITHHELD.map(([phrase, reason]) => ({
  re: new RegExp(`${START}${escapeRe(phrase)}${END}`, "iu"),
  reason,
}));

/** Names are matched as whole words, ignoring case, longest first. One-letter entries are ignored. */
export function nameMatcher(names: string[]): RegExp | null {
  const cleaned = [...new Set(names.map((n) => n.trim()))]
    .filter((n) => [...n].length >= 2)
    .sort((a, b) => (a.length !== b.length ? b.length - a.length : a < b ? -1 : 1));
  if (cleaned.length === 0) return null;
  return new RegExp(`${START}(?:${cleaned.map(escapeRe).join("|")})${END}`, "giu");
}

function replaceAll(text: string, re: RegExp, token: string): [string, number] {
  const count = text.match(re)?.length ?? 0;
  return count === 0 ? [text, 0] : [text.replace(re, () => token), count];
}

/** Remove identifying details from one line; hold the line back if it still looks identifying. */
export function redact(paragraph: string, matcher: RegExp | null): Redacted {
  let text = paragraph;
  const replaced: Record<string, number> = {};
  if (matcher) {
    const [t, n] = replaceAll(text, matcher, "[name]");
    text = t;
    if (n > 0) replaced.names = (replaced.names ?? 0) + n;
  }
  for (const p of PATTERNS) {
    const [t, n] = replaceAll(text, p.re, p.token);
    text = t;
    if (n > 0) replaced[p.label] = (replaced[p.label] ?? 0) + n;
  }
  const withheldReasons: string[] = [];
  for (const ph of PHRASES)
    if (!withheldReasons.includes(ph.reason) && ph.re.test(text)) withheldReasons.push(ph.reason);
  return { text, replaced, withheldReasons };
}

// Vertical tab and form feed are built from their codes so the pattern holds no control characters.
const LINE_BREAKS = new RegExp(`[\\n\\r${String.fromCharCode(11, 12)}\\u0085\\u2028\\u2029]+`);

/** Each non-empty line is kept on its own so one bad row does not hold back the rest. */
export const paragraphs = (text: string): string[] =>
  text
    .split(LINE_BREAKS)
    .map((l) => l.replace(/^[^\S\n\r]+|[^\S\n\r]+$/g, ""))
    .filter((l) => l !== "");

export interface Intake {
  kind: EvaluationKind;
  instrument: string;
  rows: ScoreRow[];
  summary: string;
  recommendations: string;
}

export const emptyIntake = (): Intake => ({
  kind: "teamReport",
  instrument: "",
  rows: [newRow()],
  summary: "",
  recommendations: "",
});

export interface PreviewItem extends Redacted {
  id: string;
  label: string;
}

const scoreLabel = (t: ScoreType) => SCORE_TYPES.find((x) => x.id === t)?.label ?? t;

/** Everything that would be used, redacted, in order. `names` must never appear. */
export function buildPreview(intake: Intake, names: string[]): PreviewItem[] {
  const matcher = nameMatcher(names);
  const items: PreviewItem[] = [];
  const add = (id: string, label: string, source: string) =>
    items.push({ id, label, ...redact(source, matcher) });
  const instrument = intake.instrument.trim();
  intake.rows
    .filter((r) => !isBlankRow(r))
    .forEach((r, i) => {
      let line = r.measure.trim();
      if (instrument !== "") line += ` (${instrument})`;
      line += `: ${scoreLabel(r.scoreType).toLowerCase()} ${r.value.trim()}`;
      const p = r.percentile.trim();
      if (p !== "") line += `, percentile ${p}`;
      add(`score-${i}`, `Score ${i + 1}`, line);
    });
  paragraphs(intake.summary).forEach((l, i) => add(`summary-${i}`, `Summary ${i + 1}`, l));
  paragraphs(intake.recommendations).forEach((l, i) =>
    add(`recommendation-${i}`, `Recommendation ${i + 1}`, l),
  );
  return items;
}

/** Why the teacher cannot confirm yet, in plain words. Empty means ready. */
export function blockers(intake: Intake, preview: PreviewItem[]): string[] {
  const found: string[] = [];
  if (preview.length === 0) found.push("Add at least one score or some text.");
  intake.rows.forEach((r, i) => found.push(...rowProblems(r).map((m) => `Score ${i + 1}: ${m}`)));
  const held = preview.filter((p) => p.withheldReasons.length > 0).length;
  if (held > 0)
    found.push(`${held} line${held === 1 ? "" : "s"} held back. Reword or remove them.`);
  return found;
}

/** A short description of exactly what is checked. If it changes, the check is stale. */
export const fingerprint = (intake: Intake, preview: PreviewItem[]): string =>
  [intake.kind, ...preview.map((p) => `${p.id}|${p.text}|${p.withheldReasons.length > 0}`)].join(
    "\n",
  );

export const replacedSummary = (replaced: Record<string, number>): string =>
  "Removed: " +
  Object.keys(replaced)
    .sort()
    .map((k) => `${replaced[k]} ${k}`)
    .join(", ");
