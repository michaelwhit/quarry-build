import type { Student } from "@synthetic/src/types.ts";
import { type SeriesPoint, progressFor } from "./derive.ts";
import type { GoalView } from "./district.ts";

// Progress report paste kit and filing log (practice data only). The app never talks to the state
// record system: the teacher copies each goal's Yes/No and comment, pastes it there, and then
// attests that it was filed. Every step adds one log row; rows are never edited or removed.
// Records live in their own browser-storage key so the practice workspace is untouched.

export type ReportState = "not_started" | "drafted" | "approved" | "copied" | "filed_attested";

export const STATE_LABEL: Record<ReportState, string> = {
  not_started: "Not started",
  drafted: "Draft saved",
  approved: "Approved",
  copied: "Copied",
  filed_attested: "Filed (attested)",
};

export interface Period {
  id: string;
  label: string;
  /** Data on or after this day, up to and including `end`, is in the report (YYYY-MM-DD). */
  start: string;
  end: string;
  due: string;
}

/** Practice school year. Dates are made up and must be checked against the real report dates. */
export const PERIODS: readonly Period[] = [
  { id: "q1", label: "Quarter 1", start: "2026-08-01", end: "2026-10-16", due: "2026-10-23" },
  { id: "q2", label: "Quarter 2", start: "2026-10-17", end: "2026-12-18", due: "2027-01-08" },
];

export function defaultPeriod(now: Date = new Date()): Period {
  // The local calendar day, not the UTC one, so an evening visit does not jump a day ahead.
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return PERIODS.find((p) => p.due >= today) ?? PERIODS[PERIODS.length - 1]!;
}

export interface GoalEntry {
  /** The teacher's choice when it differs from the computed one; undefined follows the numbers. */
  sufficient?: boolean;
  /** One line, required when `sufficient` differs from the computed answer. */
  reason?: string;
  /** The teacher's edited comment; undefined uses the numbers-only text. */
  comment?: string;
  /** Which parts of the kit have reached the clipboard so far. */
  parts?: { comment?: boolean; yesNo?: boolean };
  /** What was approved: copy and display use this, not the live numbers. */
  frozen?: { sufficient: boolean; comment: string };
  copied?: boolean;
}

export interface LogRow {
  at: string;
  who: string;
  text: string;
  hash: string;
}

export interface ReportRecord {
  studentId: string;
  periodId: string;
  state: ReportState;
  /** Hash of the kit at approval; a different live hash means data changed since. */
  approvedHash?: string;
  goals: Record<string, GoalEntry>;
  log: LogRow[];
}

export interface GoalKit {
  goalId: string;
  sessions: number;
  from: string | undefined;
  to: string | undefined;
  baseline: number | undefined;
  latest: number | undefined;
  aim: number;
  unit: string;
  /** Yes or No from the numbers; null when there is no data, which can never be Yes. */
  computed: boolean | null;
  series: SeriesPoint[];
}

const day = (iso: string) => iso.slice(0, 10);
const round = (n: number) => String(Math.round(n * 10) / 10);

export function goalKit(g: GoalView, period: Period): GoalKit {
  const series = g.series.filter((p) => day(p.at) >= period.start && day(p.at) <= period.end);
  const prog = progressFor(series, g.plan, g.effectiveFrom, g.effectiveTo);
  const computed = series.length === 0 ? null : prog.status === "met" || prog.status === "on_track";
  return {
    goalId: g.goal.id,
    sessions: series.length,
    from: series[0] ? day(series[0].at) : undefined,
    to: series.length ? day(series[series.length - 1]!.at) : undefined,
    baseline: prog.baseline,
    latest: prog.recent,
    aim: g.plan.target_value,
    unit: g.plan.unit ? ` ${g.plan.unit}` : "",
    computed,
    series,
  };
}

export const firstNameOf = (s: Student) => s.preferred_name ?? s.first_name;

/** The numbers-only comment, used until the teacher edits it. */
export function defaultComment(s: Student, g: GoalView, k: GoalKit): string {
  if (k.sessions === 0) return "";
  const area = g.goal.area.replaceAll("_", " ");
  return (
    `${firstNameOf(s)} ${area}: ${k.sessions} session${k.sessions === 1 ? "" : "s"} recorded ` +
    `${k.from} to ${k.to}. Started at ${round(k.baseline ?? 0)}${k.unit}, most recent ` +
    `${round(k.latest ?? 0)}${k.unit}, aim ${round(k.aim)}${k.unit}.`
  );
}

export function effectiveSufficient(e: GoalEntry | undefined, k: GoalKit): boolean {
  if (k.computed === null) return false;
  return e?.sufficient ?? k.computed;
}

/** True when the teacher's answer differs from the numbers, so a reason is needed. */
export const needsReason = (e: GoalEntry | undefined, k: GoalKit) =>
  k.computed !== null && e?.sufficient !== undefined && e.sufficient !== k.computed;

export function kitHash(parts: { goalId: string; sufficient: boolean; comment: string }[]): string {
  const text = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// ---- storage ----

export const REPORTS_KEY = "goalline-practice-reports-v1";
const MAX_LOG = 500;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
let storage: StorageLike | null = null;
try {
  storage = typeof window === "undefined" ? null : window.localStorage;
} catch {
  storage = null;
}
export function useReportStorage(s: StorageLike | null) {
  storage = s;
  records = load();
  bump();
}

const STATES = new Set<string>(Object.keys(STATE_LABEL));
const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function load(): Map<string, ReportRecord> {
  const out = new Map<string, ReportRecord>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(REPORTS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return out;
    for (const r of raw) {
      if (
        !isRec(r) ||
        typeof r["studentId"] !== "string" ||
        typeof r["periodId"] !== "string" ||
        typeof r["state"] !== "string" ||
        !STATES.has(r["state"]) ||
        !isRec(r["goals"]) ||
        !Array.isArray(r["log"])
      )
        continue;
      out.set(`${r["studentId"]}|${r["periodId"]}`, r as unknown as ReportRecord);
    }
  } catch {
    // unreadable storage starts empty
  }
  return out;
}

let records = load();
let version = 0;
const listeners = new Set<() => void>();
export const getReportsVersion = () => version;
export function subscribeReports(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function bump() {
  version++;
  for (const l of listeners) l();
}
function save() {
  try {
    storage?.setItem(REPORTS_KEY, JSON.stringify([...records.values()]));
  } catch {
    // storage full or blocked: the report still works for this visit
  }
}

export function getRecord(studentId: string, periodId: string): ReportRecord {
  return (
    records.get(`${studentId}|${periodId}`) ?? {
      studentId,
      periodId,
      state: "not_started",
      goals: {},
      log: [],
    }
  );
}

/** Applies a change and appends the log rows for it. The only way a record changes. */
function commit(
  prev: ReportRecord,
  next: Partial<Pick<ReportRecord, "state" | "goals" | "approvedHash">>,
  who: string,
  rows: string[],
  hash: string,
  now: Date,
) {
  const added = rows.map((text) => ({ at: now.toISOString(), who, text, hash }));
  const log = [...prev.log, ...added].slice(-MAX_LOG);
  records.set(`${prev.studentId}|${prev.periodId}`, { ...prev, ...next, log });
  save();
  bump();
}

export interface Ctx {
  who: string;
  hash: string;
  now?: Date;
}

/** Changing an answer or comment. Only before approval. */
export function editGoal(rec: ReportRecord, goalId: string, patch: GoalEntry, ctx: Ctx) {
  if (rec.state === "approved" || rec.state === "copied" || rec.state === "filed_attested") return;
  const goals = { ...rec.goals, [goalId]: { ...rec.goals[goalId], ...patch } };
  const first = rec.state === "not_started";
  commit(
    rec,
    { goals, state: "drafted" },
    ctx.who,
    first ? ["Draft saved"] : [],
    ctx.hash,
    ctx.now ?? new Date(),
  );
}

export interface FrozenGoal {
  goalId: string;
  sufficient: boolean;
  comment: string;
}

/** Approving freezes each goal's Yes/No and comment, so later data cannot change what is copied. */
export function approve(rec: ReportRecord, frozen: FrozenGoal[], ctx: Ctx) {
  if (rec.state !== "not_started" && rec.state !== "drafted") return;
  const goals = { ...rec.goals };
  for (const f of frozen)
    goals[f.goalId] = {
      ...goals[f.goalId],
      frozen: { sufficient: f.sufficient, comment: f.comment },
    };
  commit(
    rec,
    { state: "approved", goals, approvedHash: ctx.hash },
    ctx.who,
    ["Approved"],
    ctx.hash,
    ctx.now ?? new Date(),
  );
}

/** Takes an approved report back to a draft so it can be rebuilt from new data. Not once filed. */
export function reopen(rec: ReportRecord, ctx: Ctx) {
  if (rec.state !== "approved" && rec.state !== "copied") return;
  const goals: Record<string, GoalEntry> = {};
  for (const [id, e] of Object.entries(rec.goals)) {
    const kept: GoalEntry = {};
    if (e.sufficient !== undefined) kept.sufficient = e.sufficient;
    if (e.reason !== undefined) kept.reason = e.reason;
    if (e.comment !== undefined) kept.comment = e.comment;
    goals[id] = kept;
  }
  const next = { ...rec, state: "drafted" as const, goals };
  delete next.approvedHash;
  records.set(`${rec.studentId}|${rec.periodId}`, next);
  commit(next, {}, ctx.who, ["Reopened to update from new data"], ctx.hash, ctx.now ?? new Date());
}

/** True when the numbers changed after approval. */
export const dataChanged = (rec: ReportRecord, liveHash: string) =>
  (rec.state === "approved" || rec.state === "copied") && rec.approvedHash !== liveHash;

export type CopyPart = "comment" | "yesNo";

/**
 * Records that one part of a goal's kit reached the clipboard. The goal counts as copied only once
 * every part it needs has been copied (a goal with no data has no comment, so only Yes/No). When
 * every goal is copied the report moves to "copied".
 */
export function markCopied(
  rec: ReportRecord,
  goalId: string,
  goalNumber: number,
  allGoalIds: string[],
  part: CopyPart,
  needed: readonly CopyPart[],
  ctx: Ctx,
) {
  // The clipboard write is awaited before this runs, so work from the latest saved record.
  rec = getRecord(rec.studentId, rec.periodId);
  if (rec.state !== "approved" && rec.state !== "copied") return;
  const prev = rec.goals[goalId];
  if (prev?.copied) return;
  const parts = { ...prev?.parts, [part]: true };
  const done = needed.every((n) => parts[n]);
  const goals = { ...rec.goals, [goalId]: { ...prev, parts, copied: done } };
  if (!done) {
    records.set(`${rec.studentId}|${rec.periodId}`, { ...rec, goals });
    save();
    bump();
    return;
  }
  const all = allGoalIds.every((id) => goals[id]?.copied);
  const rows = [`Copied goal ${goalNumber}`, ...(all ? ["All goals copied"] : [])];
  commit(
    rec,
    { goals, state: all ? "copied" : rec.state },
    ctx.who,
    rows,
    ctx.hash,
    ctx.now ?? new Date(),
  );
}

export function attest(rec: ReportRecord, ctx: Ctx) {
  if (rec.state !== "copied") return;
  commit(
    rec,
    { state: "filed_attested" },
    ctx.who,
    ["Attested as filed in SRS"],
    ctx.hash,
    ctx.now ?? new Date(),
  );
}

export function resetReportsForTests() {
  records = new Map();
  save();
  bump();
}
